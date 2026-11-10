#!/bin/sh
# Teste do instalador no Wine: Gerador 2.0.3 + Gravador 0.3 instalados, pastas de vídeos com arquivos,
# depois o Olho da Cena por cima. Confere atalhos, Gravador removido e vídeos intocados.
set -u
export WINEPREFIX=${WINEPREFIX:-/workspace/wine-olho} WINEDEBUG=-all
GER=${GER:-/workspace/gerador-video-v2/dist/Gerador-de-Video-Setup-2.0.3.exe}
GRA=${GRA:-/workspace/gravador-video/dist/Gravador-de-Video-teste-Setup-0.3.0.exe}
OLHO=${OLHO:-$(dirname "$0")/../dist/Olho-da-Cena-Setup-1.0.0.exe}
rm -rf "$WINEPREFIX"; mkdir -p "$WINEPREFIX"
xvfb-run -a sh -c "wineboot -i >/dev/null 2>&1; wine '$GER' /S; wine '$GRA' /S; wineserver -w"
U="$WINEPREFIX/drive_c/users/$(whoami)"
P="$U/AppData/Local/Programs"; M="$U/AppData/Roaming/Microsoft/Windows/Start Menu/Programs"; D="$U/Desktop"
falhas=0
ok() { if eval "$2"; then echo "ok     $1"; else echo "FALHOU $1"; falhas=$((falhas+1)); fi; }
ok "antes: Gerador e Gravador instalados, com atalhos" '[ -f "$D/Gerador de Vídeo.lnk" ] && [ -f "$D/Gravador de Vídeo (teste).lnk" ] && [ -d "$P/gravador-video-teste" ]'
mkdir -p "$U/Documents/Gravador de Vídeo" "$U/Documents/Gerador de Vídeo" "$U/Documents/Olho da Cena" "$U/Videos/meus vídeos" "$U/AppData/Roaming/Gravador de Vídeo (teste)"
head -c 300000 /dev/urandom > "$U/Documents/Gravador de Vídeo/Vídeo 2026-10-20 10h00m00s (horizontal).mp4"
head -c 200000 /dev/urandom > "$U/Documents/Gravador de Vídeo/20-10 horizontal 30 quadros fundo praia.mp4"
head -c 100000 /dev/urandom > "$U/Documents/Gerador de Vídeo/conto.mp4"
head -c 100000 /dev/urandom > "$U/Documents/Olho da Cena/ja existia.mp4"
head -c 100000 /dev/urandom > "$U/Videos/meus vídeos/x.mp4"
head -c 50000 /dev/urandom > "$P/gravador-video-teste/video guardado na pasta do programa.mp4"
echo '{"formato":"vertical","qualidade":"padrao"}' > "$U/AppData/Roaming/Gravador de Vídeo (teste)/configuracoes.json"
lista() { (cd "$U" && { find Documents Videos "AppData/Roaming/Gravador de Vídeo (teste)" -type f; find "AppData/Local/Programs/gravador-video-teste" -type f -name '*.mp4'; } 2>/dev/null | while read -r f; do md5sum "$f"; done | sort); }
lista > /tmp/olho-wine-antes.md5
xvfb-run -a sh -c "wine '$OLHO' /S; wineserver -w"
lista > /tmp/olho-wine-depois.md5
GUID=b539aea6-8db1-5e7e-963b-10c6d3f2432c
ok "Olho da Cena instalado (no lugar do Gerador)" '[ -f "$P/gerador-video/Olho da Cena.exe" ] && [ ! -f "$P/gerador-video/Gerador de Vídeo.exe" ]'
ok "atalho Olho da Cena na área de trabalho e no menu Iniciar" '[ -f "$D/Olho da Cena.lnk" ] && [ -f "$M/Olho da Cena.lnk" ]'
ok "atalho Gerador de Vídeo sumiu" '[ ! -f "$D/Gerador de Vídeo.lnk" ] && [ ! -f "$M/Gerador de Vídeo.lnk" ]'
ok "atalho Gravador de Vídeo (teste) sumiu" '[ ! -f "$D/Gravador de Vídeo (teste).lnk" ] && [ ! -f "$M/Gravador de Vídeo (teste).lnk" ]'
ok "programa Gravador removido (exe, recursos, desinstalador)" '[ ! -e "$P/gravador-video-teste/Gravador de Vídeo (teste).exe" ] && [ ! -e "$P/gravador-video-teste/resources" ] && [ ! -e "$P/gravador-video-teste/Uninstall Gravador de Vídeo (teste).exe" ]'
ok "Gravador fora da lista de programas instalados" '! wine reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$GUID" >/dev/null 2>&1'
ok "Olho da Cena 1.0.0 na lista de programas instalados" 'wine reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s 2>/dev/null | tr -d "\r" | grep -q "Olho da Cena 1.0.0"'
ok "Gerador fora da lista de programas instalados" '! wine reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s 2>/dev/null | tr -d "\r" | grep -aq "DisplayName.*Gerador"'
ok "vídeos e configurações intocados (mesmo conteúdo, mesmos nomes)" 'diff /tmp/olho-wine-antes.md5 /tmp/olho-wine-depois.md5'
echo "arquivos conferidos: $(wc -l < /tmp/olho-wine-depois.md5)"
[ $falhas -eq 0 ] && echo "TUDO OK" || echo "$falhas FALHA(S)"
exit $falhas
