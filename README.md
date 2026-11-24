# Blocos — Mundo Sandbox

Protótipo jogável de sandbox voxel em navegador. Não usa assets externos; os blocos e a textura pixelada são gerados no cliente. O Three.js é carregado pelo CDN jsDelivr.

## Executar

Sirva esta pasta por HTTP (módulos ES não funcionam de forma confiável ao abrir o HTML diretamente) e acesse o endereço local no navegador:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000`. É necessária conexão com a internet para carregar o módulo Three.js.

## Controles

- **WASD** mover, **Espaço** pular, **Shift** correr
- **Mouse** olhar; clique esquerdo quebra, clique direito coloca blocos
- **1–9** ou roda do mouse seleciona a barra rápida
- **E** abre inventário; clique em um espaço para organizar itens
- **ESC** pausa; use o menu para retomar ou salvar e voltar

O mundo, as alterações e os dados do jogador são salvos no armazenamento local do navegador.

## Modos

- **Sobrevivência:** vida, fome, drops, crafting, ferramentas e durabilidade.
- **Criativo:** voo com `F`, recursos ilimitados, remoção instantânea e inventário criativo.

Use o botão de modo no menu inicial ou o botão equivalente no menu de pausa para alternar modos em uma partida existente.
