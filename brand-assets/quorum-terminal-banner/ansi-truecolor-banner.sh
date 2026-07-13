#!/usr/bin/env sh
# Quorum terminal banner v2. Brand colors only:
# emerald #10B981 -> teal #0EA5A4 -> cyan #22D3EE, consensus accent #F59E0B.

awk '
BEGIN {
  r1=16;  g1=185; b1=129;
  r2=14;  g2=165; b2=164;
  r3=34;  g3=211; b3=238;
}
{
  line=$0
  n=length(line)
  for (i=1; i<=n; i++) {
    ch=substr(line,i,1)
    if (ch==" ") {
      printf " "
    } else if (ch=="*") {
      printf "\033[38;2;245;158;11m%s\033[0m", ch
    } else {
      t=(n<=1 ? 0 : (i-1)/(n-1))
      if (t < 0.5) {
        u=t*2
        r=int(r1+(r2-r1)*u)
        g=int(g1+(g2-g1)*u)
        b=int(b1+(b2-b1)*u)
      } else {
        u=(t-0.5)*2
        r=int(r2+(r3-r2)*u)
        g=int(g2+(g3-g2)*u)
        b=int(b2+(b3-b2)*u)
      }
      printf "\033[38;2;%d;%d;%dm%s\033[0m", r,g,b,ch
    }
  }
  printf "\n"
}
' <<'QUORUM'
      o-----o        ___  _   _  ___  ____  _   _ __  __
   o-/ \   / \-*    / _ \| | | |/ _ \|  _ \| | | |  \/  |
   |   \ \ / / |   | | | | | | | | | | |_) | | | | |\/| |
   o    >X<    o   | |_| | |_| | |_| |  _ <| |_| | |  | |
    \  / / \ \ /    \__\_\\___/ \___/|_| \_\\___/|_|  |_|
QUORUM

printf '\033[38;2;16;185;129m      o-----o         \033[38;2;245;158;11m◆  many models, working together\033[0m\n'
