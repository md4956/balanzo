# Balanzo

A small tool for splitting shared expenses. You write down who paid what and who it was for in a text file (`.txt` or `.md`). It prints the fewest payments that settle everyone up, and each person's balance.

> Hobby project, still under development.

## Requirements

Python 3. No external packages.

## Web version (phone and desktop)

The same tool runs as a web page: **https://mdortaj.github.io/balanzo/** (the `docs` folder, published with GitHub Pages). Nothing is sent to a server.

1. Paste your expenses into the box, or tap **Load .txt or .md**. You can also drop a file anywhere on the page.
2. Tap **Calculate**. Ctrl+Enter or ⌘+Enter works too.
3. Read the report, or tap **Copy report** to paste it into a messenger.

**Download** saves a `.txt` or `.md` file, matching the file you loaded. If the report on screen is out of date, or the last calculation stopped with an error, Download saves nothing: it asks you to press Calculate first, and highlights the button. It starts with the report, then an `EXPENSES` heading and the expenses it was made from. Download is off until you tap Calculate, and while the box is empty. The page works offline after the first visit. To keep it on the home screen, use "Add to Home Screen" in Safari or Chrome.

**Draft:** the text in the box is kept on this device as you type, and it is back the next time you open the page. Emptying the box clears it, and a draft that has not been edited for 30 days is dropped. Nothing is sent anywhere, but on a shared computer, empty the box when you are done.

The page shows the same report as the script. How to write the expenses is explained in [Quick start](#quick-start) and [Input format](#input-format).

## Quick start

Download `balanzo.py` from the [latest release](https://github.com/mdortaj/balanzo/releases/latest), or clone the repo.

Save this as `dinner.txt` (or `dinner.md`, which works the same way):

```
# Dinner
Anna 60 Anna Ben Chloe
Ben 30 Ben Chloe
```

Run it:

```bash
python3 balanzo.py dinner.txt
```

To run the tests (they only use the Python standard library):

```bash
python3 -m unittest discover -s tests
```

The web page has browser tests (layout, input, buttons, drafts, updates, page loading, output text and files, offline). They need Node.js 22 or newer. The full suite runs in Chrome and Microsoft Edge; set `CHROME_PATH` or `EDGE_PATH` if they are not in a standard place. A smaller suite also runs in Safari and Firefox when their drivers are running: `sudo safaridriver --enable` once for Safari, and `geckodriver` on the PATH for Firefox. A browser that is not available is skipped, and the test output says so:

```bash
node --test tests/web/browser.test.js tests/web/cross-browser.test.js
```

You get:

```
Dinner

PAYMENTS - who pays whom
Chloe pays Anna 35.00
Ben pays Anna 5.00

BALANCES - who gets or owes
Anna gets 40.00
Ben owes 5.00
Chloe owes 35.00

3 people, 2 payments, total 0.00

HOW I READ IT
Anna paid 60.00, split between Anna, Ben, Chloe
Ben paid 30.00, split between Ben, Chloe
```

- The first line of the file becomes the title.
- **PAYMENTS** is the answer. `Chloe pays Anna 35.00` means Chloe should pay Anna 35.00. The two payments settle everyone.
- **BALANCES** shows what each person gets or owes. `Anna gets 40.00` means Anna should receive 40.00.

That's all you need for most trips. The rest of this page covers the other features.

## Input format

One expense per line:

```
<payer> <amount> <person> <person> ...
```

The amount is split equally between the people listed after it. The payer only gets a share if they list themselves. So `Anna 60 Anna Ben Chloe` splits 60 three ways and includes Anna, while `Marco 415 Mateo` means Marco paid the whole amount for Mateo.

Other rules:

- **File type:** only `.txt` and `.md` files are accepted, and any other file (including one without an extension) stops with `Unsupported file type`. `.txt` and `.md` files are read the same way. In a `.md` file, don't use Markdown syntax for expenses: a list bullet (`- Anna 60 Anna Ben`) or a code fence (```` ``` ````) is read as plain text, so the line is skipped and listed under WARNINGS.
- **Names** can be separated by spaces, commas or both: `Lukas 640.5 Lukas Emma Marco,Olivia` and `Lukas 640.5 Lukas, Emma, Marco, Olivia` mean the same thing.
- **Names ignore upper and lower case.** `Jake` and `jake` are one person, shown with the first spelling written. A Note under WARNINGS says when this happens.
- **Repeated names** get more shares. `Jake 900 Jake Anna Anna Lena` splits 900 into four parts, and Anna owes two of them. Numbers are allowed in names, so `Mia1 Mia2 Mia3` are three people.
- **Decimals** work: `362.75`. Amounts that aren't finite numbers (`nan`, `inf`, `1e999`) are rejected.
- **Comments:** `#` starts a comment, and everything after it on that line is ignored. A comment can take a whole line or follow an expense: `Daniel 210 Mia1 Mia2 Mia3 # the Mias are cousins`.
- **Blank lines** are ignored.
- **Names can't contain `#`, `*` or `~`.** A `*` or `~` stops with an error, and no report is printed. A `_` is allowed, but it gets a warning, because messengers can turn the text between two underscores into italics.
- **A `#` directly after a name**, like `Mia#2`, still starts a comment. It gets a warning, and the name is read as `Mia`.
- **The title** comes from a comment on the first line of the file. `# Weekend trip` at the top makes `Weekend trip` the title. If the first line isn't a comment, there's no title.
- **Currencies** are covered below.
- **Other lines** that don't match the format are skipped and listed under WARNINGS. Watch out for plain-text notes whose second word is a number, such as `Notes: 100 euros total`, because those are read as an expense.
- **No expenses at all** (an empty file, or only lines that couldn't be read) prints a short guide on how to write one, instead of an empty report.

## Currencies

A line starting with `@` sets the currency for the expenses after it:

- `@EUR` switches to euros.
- `@` on its own switches back to plain numbers.

If a file uses more than one currency, the report has a section for each one. Each section's heading names its currency, such as `PAYMENTS (EUR)`, and every amount shows it too. A single currency has no divider. The script never converts between currencies, so each section settles on its own.

```
# Trip, two currencies
@EUR
Lukas 50 Lukas Emma
Anna 30 Anna Emma
@
Tyler 40 Tyler Chloe
```

```
Trip, two currencies

PAYMENTS (EUR) - who pays whom
Emma pays Lukas 25.00 EUR
Emma pays Anna 15.00 EUR

BALANCES (EUR) - who gets or owes
Lukas gets 25.00 EUR
Anna gets 15.00 EUR
Emma owes 40.00 EUR

3 people, 2 payments, total 0.00 EUR

PAYMENTS (NO CURRENCY) - who pays whom
Chloe pays Tyler 20.00

BALANCES (NO CURRENCY) - who gets or owes
Tyler gets 20.00
Chloe owes 20.00

2 people, 1 payment, total 0.00

HOW I READ IT
Lukas paid 50.00 EUR, split between Lukas, Emma
Anna paid 30.00 EUR, split between Anna, Emma
Tyler paid 40.00, split between Tyler, Chloe
```

Expenses before the first `@` line, and after an `@` line with nothing after it, use plain numbers. Plain numbers always come last, under the `NO CURRENCY` heading.

## Full example

[`example-expenses.txt`](example-expenses.txt) uses every input feature. [`example-expenses.md`](example-expenses.md) is the same file as Markdown:

```bash
python3 balanzo.py example-expenses.txt
```

```
Weekend trip expenses

PAYMENTS - who pays whom
Olivia pays Jake 931.79
Ben pays Jake 842.33
Anna pays Lena 696.67
Mateo pays Hannah 730.67
Mateo pays Lukas 46.96
Mateo pays Jake 42.46
Mateo pays Lena 14.58
Marco pays Emma 246.54
Marco pays Lena 1.25

BALANCES - who gets or owes
Jake gets 1,816.58
Hannah gets 730.67
Lena gets 712.50
Emma gets 246.54
Lukas gets 46.96
Marco owes 247.79
Anna owes 696.67
Mateo owes 834.67
Ben owes 842.33
Olivia owes 931.79

10 people, 9 payments, total 0.00

HOW I READ IT
Lena paid 1,250.00, split between Lena, Lukas, Jake, Ben
Lukas paid 640.50, split between Lukas, Emma, Marco, Olivia
Jake paid 2,100.00, split between Jake, Olivia, Ben, Mateo
Emma paid 980.00, split between Emma, Hannah, Marco
Marco paid 415.00, split between Mateo
Ben paid 362.75, split between Ben, Lukas, Jake
Hannah paid 1,480.00, split between Hannah, Ben, Emma, Olivia, Mateo, Anna
Mateo paid 528.00, split between Mateo, Marco, Hannah
Olivia paid 297.00, split between Olivia
Jake paid 900.00, split between Jake, Anna, Anna, Lena
```

How to read the output:

- Each heading is a name, then a dash and a short description of what the section holds, such as `PAYMENTS - who pays whom`.
- **PAYMENTS** comes first, one payment per line. Read this section first: it's enough to settle the trip. People who pay only once are listed first, sorted by amount. Then each person who pays several times, also sorted by amount, so their payments are next to each other.
- If nothing is owed, the payments section says `Everyone is settled.`
- **BALANCES** lists everyone, largest first. `gets` means the person should receive money, and `owes` means they should pay. A person with nothing to settle shows `is settled`.
- The last line gives the number of people and payments, and the total. The total should always be `0.00`, because every expense takes money from the people who share it and gives it to the payer. If it isn't, the script has a calculation bug, not a problem with your input.
- **HOW I READ IT** comes after the summary and lists each expense the way the script understood it, one per line. Check it against your file: if an amount, payer or name is wrong, the line you wrote does not say what you meant. Plain text such as `Notes: 100 euros total` shows up here as an expense.
- **WARNINGS**, when there are any, comes last. It lists the lines that were skipped and the notes about names and the title, each followed by the line it is about. See [When something looks wrong](#when-something-looks-wrong).

The output is plain text with short lines and no decoration, so it reads the same when pasted into a messenger or viewed on a narrow phone screen. The web page, the file and the command line all print this same format.

The format is versioned. This README describes version 5.0.3 (see the [changelog](CHANGELOG.md)).

## When something looks wrong

Every message under WARNINGS names the line it is about, so find that line and fix it:

| Message | What to do |
| --- | --- |
| `Invalid line: ... A line needs a payer, an amount and at least one name.` | Write the line as `payer amount who shares it`. The line is skipped. |
| `Invalid line: ... Name at least one person to share the amount.` | Add a name after the amount. The line is skipped. |
| `Invalid amount: ...` | Use a plain number such as `60` or `362.75`. The line is skipped. |
| `Invalid currency: ...` | Use one code, such as `@EUR`, or `@` on its own. The line is skipped. |
| `Warning: '#' right after a name starts a comment, so the rest of the line is ignored` | Names can't contain `#`. Remove it from the name. Everything after a `#` is ignored, so the expense is read only up to it. |
| `Error: '*' and '~' are not allowed in names. No report was made.` | Remove the `*` or `~` and run again. Nothing is printed except the warnings. |
| `Note: 'Ana' is counted as 'ana' ...` | Names ignore upper and lower case. If that is not what you meant, use a different name for the other person. |
| `Note: more than 18 people ...` | The payments are correct, but there may be more of them than the fewest possible. |

On the web page, the status line says `No report yet` when the report stopped with an error, and `Report updated.` only when it is complete.

## Versions and releases

Each version in [CHANGELOG.md](CHANGELOG.md) has a [GitHub release](https://github.com/mdortaj/balanzo/releases) with `balanzo.py` attached. The newest version is marked as the latest release, and that's the one the download link above points to.

Releases are automatic. When a change that adds a version is merged to `main`, the release workflow (`.github/workflows/release.yml`) creates that version's release, with its CHANGELOG section as the notes. Pushes that don't add a version create nothing.

To publish a new version, in the same pull request:

1. Add a CHANGELOG section with the new version and today's date, above the previous one.
2. Update the "This README describes version" line above to the new version.
3. In `docs/index.html`, set `APP_VERSION` to the new version. In `docs/version.json`, set `version` to the new version, `breaking` to `true` when people must reload before they calculate, and `summary` to one sentence about what changed. An open web page shows a notice with a Reload button when it finds this file has a newer version, and the notice says what changed for a breaking release.
4. Merge to `main`. The tests check that steps 1 to 3 agree.

## Limitations

- Splits are always equal, apart from naming someone more than once.
- Names ignore upper and lower case (see [Input format](#input-format)).
- The fewest payments are only guaranteed for up to 18 people with a balance to settle. Above that, the exact search would take too long, so the script adds a note to WARNINGS and uses a faster method that may list extra payments.
- Amounts are plain floats, shown rounded to two decimals with thousands separators (`1,816.58`).
- The script doesn't convert between currencies.
