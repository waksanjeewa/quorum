#!/usr/bin/env sh
# Quorum terminal color logo, Unicode + ANSI 24-bit truecolor.
# Brand colors only:
# background #0A0F12, emerald #10B981, teal #0EA5A4, cyan #22D3EE,
# amber #F59E0B, text #E6F1EE, muted #8FA3A0.

if [ -n "${NO_COLOR:-}" ]; then
  cat <<'QUORUM'
        ●
    ╭───┴───╮        Quorum
  ●─╯  ◢◣  ╰─●       many models, working together
  │    ◥◤    │
  ●─╮  ◢◣  ╭─●
    ╰───┬───╯
        ●
QUORUM
  exit 0
fi

emerald=$(printf '\033[38;2;16;185;129m')
teal=$(printf '\033[38;2;14;165;164m')
cyan=$(printf '\033[38;2;34;211;238m')
amber=$(printf '\033[38;2;245;158;11m')
text=$(printf '\033[38;2;230;241;238m')
muted=$(printf '\033[38;2;143;163;160m')
reset=$(printf '\033[0m')

printf '%s\n' "        ${emerald}●${reset}"
printf '%s\n' "    ${teal}╭───┴───╮${reset}        ${text}Quorum${reset}"
printf '%s\n' "  ${emerald}●${teal}─╯  ${emerald}◢${cyan}◣${teal}  ╰─${amber}●${reset}       ${muted}many models, working together${reset}"
printf '%s\n' "  ${teal}│    ${cyan}◥${emerald}◤${teal}    │${reset}"
printf '%s\n' "  ${cyan}●${teal}─╮  ${teal}◢${cyan}◣${teal}  ╭─${cyan}●${reset}"
printf '%s\n' "    ${teal}╰───┬───╯${reset}"
printf '%s\n' "        ${teal}●${reset}"
