"""Baixa todas as tabelas do Supabase no mesmo formato da "cópia de segurança" do sistema.

Usado pelo GitHub Actions (.github/workflows/backup.yml). Só biblioteca padrão do Python.
Variáveis: SUPABASE_URL e SUPABASE_SECRET_KEY (chave secreta, lê ignorando o RLS).
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

TABELAS = ['caminhoes', 'clientes', 'viagens', 'fretes', 'recebimentos', 'abastecimentos',
           'planos_manutencao', 'manutencoes', 'despesas']
PASSO = 1000

url = os.environ.get('SUPABASE_URL', '').rstrip('/')
chave = os.environ.get('SUPABASE_SECRET_KEY', '')
if not url or not chave:
    sys.exit('Falta SUPABASE_URL ou o segredo SUPABASE_SECRET_KEY no GitHub.')

cabecalhos = {'apikey': chave, 'Accept': 'application/json'}
if chave.startswith('eyJ'):  # chave antiga "service_role" (JWT) também vai no Authorization
    cabecalhos['Authorization'] = f'Bearer {chave}'


def ler(tabela):
    linhas = []
    while True:
        req = urllib.request.Request(
            f'{url}/rest/v1/{tabela}?select=*&order=id&limit={PASSO}&offset={len(linhas)}', headers=cabecalhos)
        with urllib.request.urlopen(req, timeout=60) as r:
            parte = json.load(r)
        linhas += parte
        if len(parte) < PASSO:
            return linhas


dados = {t: ler(t) for t in TABELAS}
print(json.dumps({'sistema': 'controle-frota', 'versao': 1,
                  'gerado_em': datetime.now(timezone.utc).isoformat(), 'dados': dados}, ensure_ascii=False))
print('Backup: ' + ', '.join(f'{t}={len(v)}' for t, v in dados.items()), file=sys.stderr)
