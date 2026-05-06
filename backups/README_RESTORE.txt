Восстановление из файла thaiinvest-restore-2026-05-06.bundle
--------------------------------------------------------------
Проверка целостности:
  git bundle verify backups/thaiinvest-restore-2026-05-06.bundle

Клон из bundle в новую папку (ветка main):
  git clone backups/thaiinvest-restore-2026-05-06.bundle restored-thaiinvest
  cd restored-thaiinvest && npm ci && npx prisma generate

Подтянуть в уже существующий bare или добавить remote и fetch — см. git bundle --help.
