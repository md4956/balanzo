# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/). Versions before 1.0.0 may change behavior in a minor release.

## [5.0.0] - 2026-11-16

### Changed
- Breaking: names ignore upper and lower case, so `Ana` and `ana` are one person, shown with the first spelling written. A Note under WARNINGS says when this happens. A file that used different capitals for different people will now give different results.
- Clearer messages for skipped lines, invalid currencies, `#` right after a name, and `*` or `~` in a name. The `*` or `~` error now says that no report was made.
- On the web page, the status line says `No report yet` when the last calculation stopped with an error, instead of `Report updated.`
- On the web page, the layout fills the window on tablets and desktops, so nothing scrolls on a laptop, tablet or landscape phone. On phones, Calculate stays on screen.
- On the web page, the app icon is a `D` for now, until a proper icon is made.
- On the web page, the offline cache includes the apple-touch icon, and its version is bumped so the new files are used.
- On the web page, Download no longer saves a report that is out of date or stopped with an error. It asks you to press Calculate first, and highlights the button.

### Added
- `HOW I READ IT` after the summary: each expense as the script understood it, so you can check the file was read correctly.
- On the web page, a draft of the box is kept on this device. It is restored on the next visit, dropped when the box is emptied, and dropped after 30 days without an edit.
- On the web page, `Load .txt or .md` is a button, so it works from the keyboard.
- On the web page, an open page shows a notice with a Reload button when a newer version is published (`docs/version.json`). A breaking release says what changed.
- Browser tests in Safari and Firefox, through WebDriver, when their drivers are running.

## [4.0.0] - 2026-11-16

### Changed
- Renamed the project to Balanzo. The script is now `balanzo.py`, the web page is titled Balanzo, and the browser script is `docs/balanzo.js`. The output and the rules for writing expenses are unchanged.
- Breaking: `simple-spliito.py` no longer exists. Run `python3 balanzo.py`, and download `balanzo.py` from the latest release.

## [3.1.0] - 2026-11-15

### Changed
- On the web page, Download saves the report first, then an `EXPENSES` heading and the expenses it was made from, instead of the expenses alone. The report is made from the text in the box when Download is clicked.

### Fixed
- On the web page, Download is disabled until Calculate has been clicked, and while the box is empty. Before, it saved an empty file in those cases.

## [3.0.1] - 2026-11-15

### Fixed
- On the web page, the input and report boxes on a desktop screen are now the same height, start at the same line and use the same font size, so their edges and buttons line up. The report scrolls inside its box instead of growing past it.

## [3.0.0] - 2026-11-14

### Added
- A web page in `docs/` that prints the same report as the script. It loads `.txt` and `.md` files, works offline after one visit, and has Copy and Download buttons.
- A guide instead of an empty report when no expense line can be read, on the web page and in the script.
- On the web page, the report is dimmed when the text changes after Calculate, and it flashes when it updates.

### Changed
- The report starts with PAYMENTS, then BALANCES, then one line with the people, payments and total. The SUMMARY and TOTAL headings are gone, and so is the `-----` divider between currencies.
- Each currency section is headed with its currency, such as `PAYMENTS (EUR)`.
- Warnings and skipped lines (`Invalid ...`, `Warning: ...`, `Note: ...`) are listed in a WARNINGS block after the report, instead of before it.
- The report has no rule lines and no indentation, and its lines are short, so it pastes cleanly into messengers and reads on a narrow screen.
- The output format is the same on the web page, from the file, and from the command line. This is a breaking change for anyone who reads the output by its old headings.

## [2.0.0] - 2026-11-14

### Changed
- Only `.txt` and `.md` files are accepted (the extension is case-insensitive). Any other file, including one without an extension, exits with `Unsupported file type`. This is a breaking change: files that were read before, such as `.csv` or extensionless files, now need a `.txt` or `.md` name.

### Fixed
- Files of other types are no longer parsed line by line, which printed an `Invalid line` message for each line and still exited with success. Binary files no longer fail with a decode error.

## [1.1.0] - 2026-11-14

### Added
- Markdown input: `.md` files are officially supported alongside `.txt`, with a sample `example-expenses.md`. The README documents it, the usage message mentions it, and the tests cover it. The script's behavior is unchanged.

## [1.0.0] - 2026-11-14

First stable release. Its behavior matches 0.9.0, plus the changelog and a download link in the README. From this version on, changing the input format or the output format needs a major version bump.

### Added
- This changelog, and a link to the latest release in the README.

## [0.9.0] - 2026-11-14

### Added
- Currency sections: a line starting with `@` sets the currency for the expenses after it. Each currency gets its own summary, balances, total and payments, with every heading naming the currency and a `-----` line between sections. Single-currency files have no separator. Plain-number expenses in a multi-currency file are labelled `NO CURRENCY`.
- A title: a comment on the first line of the file becomes the title.
- Warnings for `_`, `*` and `~` in the title. The title is still printed as typed.
- A test suite (`python3 -m unittest discover -s tests`), including a check of the settlement against an exact solver on random cases.

### Fixed
- Files saved with a byte-order mark at the start are read correctly.

## [0.8.0] - 2026-11-13

### Added
- Inline comments: `#` starts a comment anywhere on a line. A `#` directly after a name, such as `mia#2`, triggers a warning.
- A total check line under the balances, showing that the balances add up to zero.
- Plain-text output for messengers and narrow screens: no alignment, one payment per line, upper-case headings, a summary line, and thousands separators.

### Changed
- Balances show `gets` and `owes` instead of signed numbers, sorted largest first.
- Payments are grouped by payer. People who pay once come first, then one block per person who pays several times.

## [0.7.0] - 2026-11-13

### Added
- Fewest payments: the settlement uses the minimum number of payments for up to 18 people with a balance. Above that, a faster method runs and the script prints a note.
- Rejects `*` and `~` in names with an error, and warns about `_`.

### Fixed
- `nan`, `inf`, `Infinity` and out-of-range amounts such as `1e999` are rejected. They used to corrupt balances or hang the script.
- A space after a comma no longer creates an empty name.
- A line with only a comma after the amount is reported as an invalid list of people.

## [0.6.1] - 2026-11-06

### Changed
- Renamed the script to `simple-spliito.py` to match the repository name, and fixed the usage message.

## [0.6.0] - 2026-11-05

### Added
- Lines starting with `#` are comments.
- A README and a full-feature example file.

## [0.5.0] - 2026-11-05

The first version kept in this repository: `spliter` v0.5, a command-line tool that settles shared expenses from a text file. Versions 0.1 to 0.4 were developed locally before the repository was created, and their history isn't here.
