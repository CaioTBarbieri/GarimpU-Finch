# Logs do Florence

Coloque nesta pasta os arquivos CSV históricos usados pela estimativa.
O organizador acrescenta novos registros em
`log_classificacao_florence.csv`.

Cada registro representa um hotel e contém:

- `execucao_id`;
- `hotel`;
- `inicio_classificacao`;
- `fim_classificacao`;
- `duracao_segundos`;
- `numero_imagens`;
- `tamanhos_imagens_bytes` (JSON com nome e tamanho de cada imagem);
- `tamanho_total_bytes`;
- `numero_hoteis`;
- `status`.

Arquivos terminados em `.example.csv` documentam o formato, mas não entram no
cálculo.
