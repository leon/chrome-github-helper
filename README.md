# GitHub Helper

Chrome extension that adds keyboard shortcuts to the new GitHub pull request **Files changed** view (`/pull/<n>/changes`).

| Key       | Action                                                                  |
| --------- | ----------------------------------------------------------------------- |
| `j` / `k` | Next / previous file                                                    |
| `J` / `K` | Next / previous **unviewed** file                                       |
| `v`       | Toggle **Viewed** on the current file. Marking it jumps to the next unviewed file |
| `o`       | Collapse / expand the current file                                      |
| `Esc`     | Clear the current-file highlight                                        |

The current file gets an accent border, and a small status line at the bottom shows its position, path and the number of viewed files.

Shortcuts are ignored while you type in a comment box or have a menu or dialog open. If you scroll part of the way into a file, `k` first goes back to the top of that file.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Reload any open PR tabs.

After you edit the files, click the reload icon on the extension card, then reload the PR tab.

## How it works

`content.js` runs on `github.com` and checks the URL on each keypress, so it also works after GitHub's client-side navigation from the Conversation tab. It finds files by `div[role="region"][id^="diff-"]` and toggles the header button labelled `Viewed` / `Not Viewed`. If GitHub changes that markup, update the selectors at the top of `content.js`.
