# Document test findings

Eight synthetic scenarios generated successfully. Visual review does NOT pass overall.

- Current and legacy partial-work affidavits incorrectly populate the full-completion section.
- Current partial-work amount overlaps printed text on page 1.
- Legacy work affidavit coordinates overlap printed text; county is placed on the state line.
- Current completed-by-other date appears on a telephone-attempt line rather than the completed-by-other line.
- Legacy no-access affidavit incorrectly fills the denied-access section on page 2 and has overlapping attempt dates.
- Refused-access date uses attempt2_date before the actual outcome date when both exist; invoice and affidavit can disagree.
- Invoice sample field placement is readable, but long synthetic invoice numbers shrink too small. No-work invoice description still uses repair scope and should be reviewed for outcome-specific wording.

Current full-work and refused-access layouts render without clipping for the sample values, but this does not certify date semantics or financial correctness.

Do not treat generation_checks_passed as a document-approval result. PDF previews are in output/pdf/sample-scenarios. Real work orders were not modified.
