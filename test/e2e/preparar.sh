#!/usr/bin/env bash
# Gera os vídeos (y4m) e o som (wav) da câmera e do microfone falsos dos testes,
# a partir de fotos de domínio público da NASA (testdata/fontes).
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"
F="$D/testdata/fontes"
O="${1:-/tmp/gravador-teste-midia}"
mkdir -p "$O"
y4m() { # nome filtro [entrada]
  local nome=$1 filtro=$2 ent=${3:-"$F/Sally_Ride_(1984).jpg"}
  [ -s "$O/$nome.y4m" ] || ffmpeg -v error -y -loop 1 -i "$ent" -vf "$filtro,format=yuv420p" -frames:v 5 -r 30 "$O/$nome.y4m"
}
# Rosto no meio, até o peito.
y4m centrado "scale=-2:720,pad=1280:720:(ow-iw)/2:0:0x707070"
# Mesmo retrato encostado no lado esquerdo da imagem.
y4m deslocado "scale=-2:720,pad=1280:720:30:0:0x707070"
y4m deslocado2 "scale=-2:720,pad=1280:720:190:0:0x707070"
# Escuro.
y4m escuro "scale=-2:720,pad=1280:720:(ow-iw)/2:0:0x707070,eq=brightness=-0.32:contrast=0.5"
# Bem perto: só o rosto, ocupando a imagem.
y4m perto "crop=iw*0.5:iw*0.5*9/16*1.6:iw*0.25:ih*0.12,scale=1280:720"
# Corpo inteiro.
y4m corpo "scale=-2:720,pad=1280:720:(ow-iw)/2:0:0xe8e8e8" "$F/corpo_inteiro.jpg"
# Seis pessoas.
y4m grupo "crop=iw:ih*0.6:0:ih*0.05,scale=1280:-2,pad=1280:720:0:(oh-ih)/2" "$F/dois_rostos.jpg"
# Outra pessoa, pele escura, até a cintura (não deve dar "ambiente escuro").
y4m jemison "scale=-2:720,pad=1280:720:(ow-iw)/2:0:0x707070" "$F/Mae_Carol_Jemison.jpg"
# Sem ninguém.
[ -s "$O/vazio.y4m" ] || ffmpeg -v error -y -f lavfi -i "gradients=s=1280x720:c0=0x335577:c1=0x99aabb:speed=0.0001" -frames:v 5 -r 30 -pix_fmt yuv420p "$O/vazio.y4m"
# Microfone: um tom de 440 Hz, alto o bastante para medir.
[ -s "$O/mic.wav" ] || ffmpeg -v error -y -f lavfi -i "sine=f=440:d=3:sample_rate=48000" -af volume=0.5 -ac 1 "$O/mic.wav"
ls "$O"
# Muito movimento (ruído que muda a cada quadro): o pior caso para o tamanho do arquivo.
[ -s "$O/ruido.y4m" ] || ffmpeg -v error -y -f lavfi -i "testsrc2=s=1280x720:r=30,noise=alls=30:allf=t+u" -frames:v 60 -pix_fmt yuv420p "$O/ruido.y4m"
# Pessoa na frente de um fundo cheio de detalhes (para ver o fundo borrado ou trocado).
[ -s "$O/cenario.y4m" ] || ffmpeg -v error -y -f lavfi -i "testsrc2=s=1280x720:r=30" -i "$F/Sally_Ride_(1984).jpg" \
  -filter_complex "[1:v]scale=-2:720[p];[0:v][p]overlay=(W-w)/2:0,format=yuv420p" -frames:v 5 "$O/cenario.y4m"
ls "$O" >/dev/null
# 0.3: fotos com objetos (Wikimedia Commons, CC0 e CC BY 2.0; créditos em fotos-objetos/CREDITOS.txt).
for n in obj3 obj4 obj5; do
  [ -s "$O/$n.y4m" ] || ffmpeg -v error -y -loop 1 -i "$D/test/e2e-grav/fotos-objetos/$n.jpg" -vf "scale=-2:720,pad=1280:720:(ow-iw)/2:0:0x707070,format=yuv420p" -frames:v 5 -r 30 "$O/$n.y4m"
done
