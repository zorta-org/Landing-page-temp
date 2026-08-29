# Zorta Community + Projects Update

## Included fixes
- Community admins can be demoted back to members; only the community owner can promote/demote admins.
- Member management uses a labeled action menu with confirmations for kick/ban.
- Channel switches clear stale messages immediately and show a skeleton loading state.
- UI timestamps use the browser/user local timezone.
- Home task panel has bounded scrolling and cleaner layout behavior.
- Projects is upgraded into a minimal GitHub-style repository experience:
  - create projects using the existing Projects create flow
  - add/upload files
  - browse files
  - edit/create/delete files
  - automatic commit records for file add/update/delete
  - commit history with unified diffs
  - manual commit messages
  - README/overview
  - GitHub repository linking
  - readable code editor and lightweight syntax highlighting

## Setup

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed.py
python run.py
```

### Frontend
Open another terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend build command is:
```bash
npm run build
```

The uploaded source archive contained macOS-specific dependency binaries, so `node_modules` and the backend virtualenv are intentionally excluded from this delivery archive. Run the install commands above on the target machine to install platform-correct dependencies.
