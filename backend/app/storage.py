from __future__ import annotations

import csv
import time

try:
    import fcntl  # type: ignore[import-not-found]
except ImportError:  # Windows
    fcntl = None
    import msvcrt
import json
import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator

from .schema import CSV_TABLES


class CsvTransaction:
    """Read/modify/write transaction; changes are buffered until the store commits."""

    def __init__(self, root: Path):
        self.root = root
        self.pending: dict[str, list[dict]] = {}

    def read(self, table: str) -> list[dict[str, str]]:
        if table not in CSV_TABLES:
            raise KeyError(f"Unknown CSV table: {table}")
        if table in self.pending:
            return [dict(row) for row in self.pending[table]]
        path = self.root / f"{table}.csv"
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))

    def write(self, table: str, rows: Iterable[dict]) -> None:
        if table not in CSV_TABLES:
            raise KeyError(f"Unknown CSV table: {table}")
        self.pending[table] = [dict(row) for row in rows]


@contextmanager
def _exclusive_lock(handle) -> Iterator[None]:
    """Cross-platform exclusive lock for the CSV store lock file."""
    if fcntl is not None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        return

    # msvcrt locks a byte range and requires that byte to exist in the file.
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b"\0")
        handle.flush()
    handle.seek(0)
    while True:
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            break
        except OSError:
            time.sleep(0.05)
    try:
        yield
    finally:
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


class CsvStore:
    """CSV repository adapter with process-safe, recoverable multi-table writes."""

    JOURNAL_NAME = ".pcm-transaction.json"
    TRANSACTION_DIR = ".transactions"

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.root / ".pcm-storage.lock"
        with self.transaction() as tx:
            for table in CSV_TABLES:
                if not (self.root / f"{table}.csv").exists():
                    tx.write(table, [])

    @staticmethod
    def _fsync_dir(path: Path) -> None:
        # Windows does not support opening directories for fsync the same way POSIX does.
        if os.name == "nt":
            return
        fd = os.open(path, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    @staticmethod
    def _write_csv(path: Path, table: str, rows: Iterable[dict]) -> None:
        columns = CSV_TABLES[table]
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            for row in rows:
                writer.writerow({key: "" if row.get(key) is None else row.get(key, "") for key in columns})
            handle.flush()
            os.fsync(handle.fileno())

    def _atomic_json(self, path: Path, document: dict) -> None:
        fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=self.root)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(document, handle, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, path)
            self._fsync_dir(self.root)
        except Exception:
            Path(temporary_name).unlink(missing_ok=True)
            raise

    def _recover(self) -> None:
        journal_path = self.root / self.JOURNAL_NAME
        txn_root = self.root / self.TRANSACTION_DIR
        if not journal_path.exists():
            if txn_root.exists():
                for orphan in txn_root.iterdir():
                    if orphan.is_dir():
                        shutil.rmtree(orphan, ignore_errors=True)
            return
        try:
            journal = json.loads(journal_path.read_text(encoding="utf-8"))
            txn_id = journal["id"]
            phase = journal["phase"]
            entries = journal["entries"]
            if phase not in {"prepared", "committed"} or not isinstance(entries, dict):
                raise ValueError("Unrecognized transaction journal.")
            txn_dir = txn_root / txn_id
            if phase == "prepared":
                for table, info in entries.items():
                    if table not in CSV_TABLES:
                        raise ValueError("Transaction journal lists an unknown table.")
                    destination = self.root / f"{table}.csv"
                    backup = txn_dir / f"{table}.old"
                    if info.get("had_old"):
                        if not backup.is_file():
                            raise RuntimeError(f"Cannot recover CSV transaction: backup for {table} is missing.")
                        os.replace(backup, destination)
                    else:
                        destination.unlink(missing_ok=True)
            shutil.rmtree(txn_dir, ignore_errors=True)
            journal_path.unlink(missing_ok=True)
            if txn_root.exists():
                for orphan in txn_root.iterdir():
                    if orphan.is_dir():
                        shutil.rmtree(orphan, ignore_errors=True)
            self._fsync_dir(self.root)
        except Exception as exc:
            raise RuntimeError("CSV transaction recovery failed; persistent files were left untouched for inspection.") from exc

    def _commit(self, pending: dict[str, list[dict]]) -> None:
        if not pending:
            return
        txn_id = uuid.uuid4().hex
        txn_root = self.root / self.TRANSACTION_DIR
        txn_dir = txn_root / txn_id
        txn_dir.mkdir(parents=True, exist_ok=False)
        entries: dict[str, dict[str, bool]] = {}
        journal_path = self.root / self.JOURNAL_NAME
        try:
            for table, rows in pending.items():
                if table not in CSV_TABLES:
                    raise KeyError(f"Unknown CSV table: {table}")
                target = self.root / f"{table}.csv"
                staged = txn_dir / f"{table}.new"
                backup = txn_dir / f"{table}.old"
                had_old = target.is_file()
                if had_old:
                    with target.open("rb") as source, backup.open("wb") as destination:
                        shutil.copyfileobj(source, destination)
                        destination.flush()
                        os.fsync(destination.fileno())
                self._write_csv(staged, table, rows)
                entries[table] = {"had_old": had_old}
            self._fsync_dir(txn_dir)
            self._atomic_json(journal_path, {"id": txn_id, "phase": "prepared", "entries": entries})
            for table in pending:
                os.replace(txn_dir / f"{table}.new", self.root / f"{table}.csv")
            self._fsync_dir(self.root)
            self._atomic_json(journal_path, {"id": txn_id, "phase": "committed", "entries": entries})
            shutil.rmtree(txn_dir, ignore_errors=True)
            journal_path.unlink(missing_ok=True)
            self._fsync_dir(self.root)
        except Exception:
            if journal_path.exists():
                self._recover()
            else:
                shutil.rmtree(txn_dir, ignore_errors=True)
            raise

    @contextmanager
    def transaction(self) -> Iterator[CsvTransaction]:
        self.root.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a+b") as lock_file:
            with _exclusive_lock(lock_file):
                self._recover()
                transaction = CsvTransaction(self.root)
                yield transaction
                self._commit(transaction.pending)

    def read(self, table: str) -> list[dict[str, str]]:
        with self.transaction() as tx:
            return tx.read(table)

    def write(self, table: str, rows: Iterable[dict]) -> None:
        with self.transaction() as tx:
            tx.write(table, rows)
