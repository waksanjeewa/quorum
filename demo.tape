# Quorum CLI demo for charmbracelet/vhs.
# Run: vhs demo.tape

Output quorum-demo.gif

Set Shell "bash"
Set Width 1200
Set Height 700
Set FontSize 22
Set FontFamily "JetBrains Mono"
Set LineHeight 1.15
Set Padding 28
Set Margin 0
Set Framerate 30
Set CursorBlink true
Set TypingSpeed 35 ms
Set Theme { "name": "Quorum", "black": "#0A0F12", "red": "#F59E0B", "green": "#10B981", "yellow": "#F59E0B", "blue": "#22D3EE", "magenta": "#0EA5A4", "cyan": "#22D3EE", "white": "#E6F1EE", "brightBlack": "#8FA3A0", "brightRed": "#F59E0B", "brightGreen": "#10B981", "brightYellow": "#F59E0B", "brightBlue": "#22D3EE", "brightMagenta": "#0EA5A4", "brightCyan": "#22D3EE", "brightWhite": "#E6F1EE", "background": "#0A0F12", "foreground": "#E6F1EE", "selection": "#20312F", "cursor": "#10B981" }

Hide
Type "export PS1=''"
Enter
Type "cat > /tmp/quorum-vhs-demo.sh <<'SH'"
Enter
Type 'E=$(printf "\033[38;2;16;185;129m")'
Enter
Type 'T=$(printf "\033[38;2;14;165;164m")'
Enter
Type 'C=$(printf "\033[38;2;34;211;238m")'
Enter
Type 'A=$(printf "\033[38;2;245;158;11m")'
Enter
Type 'M=$(printf "\033[38;2;143;163;160m")'
Enter
Type 'R=$(printf "\033[0m")'
Enter
Type 'quorum() {'
Enter
Type '  printf "%s\n" "${E}      o-----o        ___  _   _  ${T}___  ____  ${C}_   _ __  __${R}"'
Enter
Type '  printf "%s\n" "${E}   o-/ \   / \-${A}*${T}    / _ \| | | |/ _ \|  _ \\${C}| | | |  \/  |${R}"'
Enter
Type '  printf "%s\n" "${E}   |   \ \ / / |${T}   | | | | | | | | | | |_) ${C}| | | | |\/| |${R}"'
Enter
Type '  printf "%s\n" "${E}   o    >X<    o${T}   | |_| | |_| | |_| |  _ <${C}| |_| | |  | |${R}"'
Enter
Type '  printf "%s\n" "${E}    \  / / \ \ /${T}    \__\_\\\\___/ \___/|_| \_${C}\\\\___/|_|  |_|${R}"'
Enter
Type '  printf "%s\n" "${E}      o-----o         ${A}◆  many models, working together${R}"'
Enter
Type '  printf "\n%s\n\n" "${E}◆${R} Live dashboard: ${C}http://127.0.0.1:5173${R}"'
Enter
Type '  printf "%s" "${E}◆ quorum › ${R}"'
Enter
Type '}'
Enter
Type 'build() {'
Enter
Type '  sleep 0.7'
Enter
Type '  printf "%s\n" "${C}proposer ▸${R} proposes a streaming CSV parser and JSON emitter..."'
Enter
Type '  sleep 1.2'
Enter
Type '  printf "%s\n" "${C}critic   ▸${R} flags an edge case (empty file)..."'
Enter
Type '  sleep 1.2'
Enter
Type '  printf "%s\n" "${A}arbiter  ▸ converged ✓${R}"'
Enter
Type '  sleep 0.9'
Enter
Type '  printf "%s\n" "${C}workshop ▸${R} Codex building in an isolated worktree..."'
Enter
Type '  sleep 1.2'
Enter
Type '  printf "%s\n" "${A}✓ merged${R}  ${M}(verified, 4 turns)${R}"'
Enter
Type '}'
Enter
Type "SH"
Enter
Type "source /tmp/quorum-vhs-demo.sh && clear"
Enter
Show

Sleep 500 ms
Type "quorum"
Sleep 150 ms
Enter
Sleep 900 ms
Type "build me a CLI that converts CSV to JSON"
Sleep 200 ms
Enter
Sleep 8 s
