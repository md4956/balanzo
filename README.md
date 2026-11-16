# Balanzo

Split shared expenses. Write down who paid what and who it was for, and Balanzo prints the fewest payments that settle everyone up.

> Hobby project, still under development.

## Two ways to use it

- **Web:** open **https://mdortaj.github.io/balanzo/**, paste your expenses (or load or drop a `.txt` / `.md` file), and tap **Calculate**. Works on phone and desktop, works offline after the first visit, and sends nothing to a server.
- **Command line:** download `balanzo.py` from the [latest release](https://github.com/mdortaj/balanzo/releases/latest) and run it with Python 3. No packages needed.

Both print the same report.

## Quick start

Save this as `dinner.txt`:

```
# Dinner
Anna 60 Anna Ben Chloe
Ben 30 Ben Chloe
```

Run it:

```bash
python3 balanzo.py dinner.txt
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

**PAYMENTS** is the answer: Chloe pays Anna 35.00, Ben pays Anna 5.00, and everyone is settled.

## Writing expenses

One expense per line:

```
<payer> <amount> <person> <person> ...
```

The amount is split equally between the people listed. The payer only gets a share if they list themselves: `Anna 60 Anna Ben Chloe` splits 60 three ways, while `Marco 415 Mateo` means Marco paid it all for Mateo.

- **Title:** a `# comment` on the first line becomes the report title.
- **Comments:** `#` starts a comment, on its own line or after an expense.
- **Names** can be separated by spaces or commas. Case is ignored (`Jake` = `jake`). Naming someone twice gives them two shares.
- **Names can't contain `#`, `*` or `~`.** Avoid `_` too: messengers may turn it into italics.
- **Amounts** are plain numbers, decimals allowed: `362.75`.
- **Files** must be `.txt` or `.md`; both are read the same way. Don't use Markdown bullets or code fences for expenses.
- Lines that don't fit the format are skipped and listed under **WARNINGS**. Careful with notes like `Notes: 100 euros total`: a number as the second word makes it an expense.

### Currencies

A line `@EUR` sets the currency for the expenses below it, and `@` on its own switches back to plain numbers. Each currency is settled in its own section; nothing is converted.

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

## Reading the report

| Section | What it tells you |
| --- | --- |
| **PAYMENTS** | Who pays whom. This is enough to settle up. |
| **BALANCES** | What each person gets (receives) or owes in total. |
| Summary line | People, payments and total. The total is always `0.00`; anything else is a bug in Balanzo, not in your input. |
| **HOW I READ IT** | Each expense as Balanzo understood it. Check it against your file. |
| **WARNINGS** | Skipped lines and notes, each with the line it is about. Only shown when there are any. |

The report is plain text with short lines, so it pastes cleanly into a messenger.

<details>
<summary>Full example: <code>example-expenses.txt</code> uses every input feature</summary>

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

</details>

## When something looks wrong

Find the line named in the warning and fix it:

| Message starts with | Fix |
| --- | --- |
| `Invalid line` | Write it as `payer amount names...`, with at least one name. |
| `Invalid amount` | Use a plain number such as `60` or `362.75`. |
| `Invalid currency` | Use one code, such as `@EUR`, or `@` alone. |
| `Warning: '#' right after a name` | Remove the `#` from the name; everything after it was ignored. |
| `Error: '*' and '~' are not allowed` | Remove them and run again. No report is made until you do. |
| `Note: 'Ana' is counted as 'ana'` | Names ignore case. Use a different name if they are different people. |
| `Note: more than 18 people` | Payments are correct, but there may be a few more than the minimum. |

## Web page notes

- **Copy report** pastes into a messenger; **Download** saves the report followed by your expenses, as `.txt` or `.md` to match the file you loaded.
- What you type is kept as a draft on this device, and dropped after 30 days without edits. On a shared computer, empty the box when you are done.
- To keep it on your home screen, use "Add to Home Screen" in Safari or Chrome.

## Limitations

- Splits are equal, apart from naming someone more than once.
- The fewest payments are guaranteed for up to 18 people with a balance. Above that, a faster method may list a few extra payments.
- No currency conversion.

## Development

Run the tests:

```bash
python3 -m unittest discover -s tests
node --test tests/web/browser.test.js tests/web/cross-browser.test.js
```

The browser tests need Node.js 22+ and run in Chrome and Edge (set `CHROME_PATH` / `EDGE_PATH` if needed), plus Safari (`sudo safaridriver --enable` once) and Firefox (`geckodriver` on the PATH) when available. Missing browsers are skipped.

### Releasing

This README describes version 5.0.4 (see the [changelog](CHANGELOG.md)).

Merging a new version to `main` creates its [GitHub release](https://github.com/mdortaj/balanzo/releases) automatically. In the same pull request:

1. Add a section to `CHANGELOG.md` with the version and today's date.
2. Update the version line above.
3. Set `APP_VERSION` in `docs/index.html`, and `version`, `breaking` and `summary` in `docs/version.json` (open pages use this to offer a reload).

The tests check that these agree.
