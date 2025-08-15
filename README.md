# Editor Interativo de Rotas (KML-EAGLE)

Aplicação web para visualização e edição interativa de rotas a partir de arquivos KML.
Permite importar KML, editar/remover pontos, limpar aglomerados, processar rotas (integração OSRM), navegar pelos pontos e exportar resultados em KML/HTML/PDF/DOCX.

Link (GitHub Pages)
- https://AmbientalSC.github.io/KML-EAGLE/

Principais funcionalidades
- Importar arquivos KML e visualizar pontos georreferenciados.
- Seleção por área (Shift + arrastar) e exclusão com tecla Delete.
- Limpeza automática de aglomerados de pontos (configurável).
- Edição de metadados da rota (Nome, Frequência, Turno) ao importar.
- Navegação local entre pontos com realce do marcador atual.
- Exportação: KML processado, HTML com instruções, PDF e DOCX.

Tecnologias e bibliotecas
- Linguagens: TypeScript, HTML, CSS.
- Bundler / Dev: Vite.
- UI: React + React DOM.
- Mapas: Leaflet + react-leaflet + leaflet-draw.
- Exportação/relatórios: jsPDF, html2canvas, docx.
- Ícones: lucide-react.

