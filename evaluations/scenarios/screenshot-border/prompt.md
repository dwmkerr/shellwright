# Screenshot Border Demo

Take screenshots with and without a macOS-style window border.

## Instructions

1. Start a shell session using `bash` with args `["--login", "-i"]` (80x24, one-dark theme)
2. Set a clean prompt: type `export PS1='\[\033[1;37m\]$ \[\033[0m\]'` and press Enter
3. Type `echo "hello from shellwright"` and press Enter
4. Wait briefly for the command to complete
5. Take a screenshot named `screenshot` (no border)
6. Take a screenshot named `screenshot-bordered` with `border: { style: "macos", title: "Terminal" }`
7. Stop the session

## Expected Result

Two PNG screenshots: `screenshot.png` (plain terminal) and `screenshot-bordered.png` (with macOS window border and "Terminal" title).
