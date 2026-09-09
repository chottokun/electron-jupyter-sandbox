# Directory Update Log

## 2026-09-09
* Added automated wheel management scripts (`scripts/add_wheels.py`, `scripts/verify_wheels.py`), pytest suite, and CI verification step (by agent:antigravity)
* Bundled office suite Python packages (`openpyxl`, `xlsxwriter`, `python-docx`, `python-pptx`, `pypdf`, `reportlab`, etc.) into `wheels/` and `jupyterlite/pypi/` (by agent:antigravity)
* Documented bundled package specifications in [pyodide-kernel.md](./components/pyodide-kernel.md) and added [bundled-packages.md](./references/bundled-packages.md) (by agent:antigravity)

## 2026-09-02
* Added `security-network-policy.md` architecture document covering static build policy, runtime multi-tier defense, COEP credentialless, and dynamic CSP for Pyodide external requests (by agent:antigravity)

## 2026-08-30

* Fixed link targets to relative paths for GitHub markdown navigation (by human:user)
* Migrated navigation indices from index.md to README.md for GitHub preview compatibility (by human:user)
* Fixed link format in ai-copy-extension.md (by human:user)
* Structured system docs into OKF v0.2 bundle with architecture, components, playbooks, and references (by human:user)
* **Initialization**: Initialized OKF v0.2 Knowledge Bundle (system-docs preset) by human:user.
