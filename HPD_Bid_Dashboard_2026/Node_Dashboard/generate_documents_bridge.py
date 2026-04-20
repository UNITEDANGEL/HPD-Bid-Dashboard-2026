from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SUPPORT_DIR = SCRIPT_DIR.parent / "Scripts"
if str(SUPPORT_DIR) not in sys.path:
    sys.path.insert(0, str(SUPPORT_DIR))

from unified_dashboard_support import (  # noqa: E402
    GeneratedBundle,
    generate_affidavit_pdf,
    generate_document_bundle,
    generate_invoice_pdf,
    generate_job_card_pdf,
    load_dashboard_dataframe,
    safe_text,
    update_generated_paths,
)


def get_row_by_omo(omo: str) -> dict:
    df = load_dashboard_dataframe()
    matches = df[df["OMO"].astype(str).str.strip() == omo]
    if matches.empty:
        raise SystemExit(json.dumps({"ok": False, "error": f"OMO not found: {omo}"}))
    return matches.iloc[0].to_dict()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate HPD documents for the Node dashboard.")
    parser.add_argument("--omo", required=True, help="OMO number to generate documents for.")
    parser.add_argument(
        "--action",
        required=True,
        choices=["job_card", "invoice", "affidavit", "bundle"],
        help="Which document action to perform.",
    )
    parser.add_argument(
        "--affidavit-type",
        default="Work Completed",
        choices=["Work Completed", "No Work Completed"],
        help="Affidavit type when action includes an affidavit.",
    )
    args = parser.parse_args()

    row = get_row_by_omo(args.omo)

    if args.action == "job_card":
        path = str(generate_job_card_pdf(row))
        update_generated_paths(args.omo, GeneratedBundle(job_card_path=path))
        print(json.dumps({"ok": True, "job_card_path": path}))
        return

    if args.action == "invoice":
        path = str(generate_invoice_pdf(row))
        update_generated_paths(args.omo, GeneratedBundle(invoice_path=path))
        print(json.dumps({"ok": True, "invoice_path": path}))
        return

    if args.action == "affidavit":
        path = str(generate_affidavit_pdf(row, args.affidavit_type))
        update_generated_paths(
            args.omo,
            GeneratedBundle(affidavit_path=path, affidavit_type=args.affidavit_type),
        )
        print(
            json.dumps(
                {
                    "ok": True,
                    "affidavit_path": path,
                    "affidavit_type": safe_text(args.affidavit_type),
                }
            )
        )
        return

    bundle = generate_document_bundle(row, args.affidavit_type)
    print(
        json.dumps(
            {
                "ok": True,
                "job_card_path": bundle.job_card_path,
                "invoice_path": bundle.invoice_path,
                "affidavit_path": bundle.affidavit_path,
                "affidavit_type": bundle.affidavit_type,
            }
        )
    )


if __name__ == "__main__":
    main()
