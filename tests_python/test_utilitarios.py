import tempfile
import unittest
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

from python_organizador.arquivos import listar_imagens_soltas
from python_organizador.log_classificacao import registrar_tempo_classificacao
from python_organizador.nomes import (
    criar_nome_final,
    limpar_para_nome_arquivo,
    remover_caracteres_invalidos,
    resolver_nome_duplicado,
    underscores_para_espacos,
)
from python_organizador.status import serializar_status


class TestNomes(unittest.TestCase):
    def test_limpeza_de_nome(self):
        self.assertEqual(
            limpar_para_nome_arquivo("  Quarto   LUXO  "),
            "quarto luxo",
        )

    def test_usa_espacos_em_vez_de_underscores(self):
        self.assertEqual(
            underscores_para_espacos("Hotel_Com_Espaços"),
            "Hotel Com Espaços",
        )
        self.assertEqual(
            criar_nome_final(
                "_Revisar",
                "quarto_com_vista",
                "Hotel_Teste",
                ".jpg",
            ),
            "Revisar quarto com vista Hotel Teste.jpg",
        )

    def test_remove_caracteres_invalidos(self):
        self.assertEqual(
            remover_caracteres_invalidos(
                'Quarto:/\\*?"<>| Luxo',
            ),
            "Quarto Luxo",
        )

    def test_trata_nomes_duplicados(self):
        with tempfile.TemporaryDirectory() as diretorio:
            pasta = Path(diretorio)
            (pasta / "foto hotel.jpg").touch()
            (pasta / "foto hotel 1.jpg").touch()
            (pasta / "pessoa.jpg").touch()

            destino = resolver_nome_duplicado(
                pasta,
                "foto hotel.jpg",
            )
            destino_com_humano = resolver_nome_duplicado(
                pasta,
                "pessoa.jpg",
                separador="_",
            )

            self.assertEqual(destino.name, "foto hotel 2.jpg")
            self.assertEqual(
                destino_com_humano.name,
                "pessoa_1.jpg",
            )


class TestArquivos(unittest.TestCase):
    def test_lista_somente_imagens_soltas(self):
        with tempfile.TemporaryDirectory() as diretorio:
            pasta = Path(diretorio)
            (pasta / "foto.jpg").touch()
            (pasta / "outra.PNG").touch()
            (pasta / "notas.txt").touch()

            encontrados = listar_imagens_soltas(pasta)

            self.assertEqual(
                {arquivo.name for arquivo in encontrados},
                {"foto.jpg", "outra.PNG"},
            )

    def test_ignora_alt_texts_json(self):
        with tempfile.TemporaryDirectory() as diretorio:
            pasta = Path(diretorio)
            (pasta / "foto.webp").touch()
            (pasta / "alt_texts.json").write_text(
                "{}",
                encoding="utf-8",
            )

            encontrados = listar_imagens_soltas(pasta)

            self.assertEqual(
                [arquivo.name for arquivo in encontrados],
                ["foto.webp"],
            )

    def test_ignora_imagens_em_subpastas(self):
        with tempfile.TemporaryDirectory() as diretorio:
            pasta = Path(diretorio)
            subpasta = pasta / "_Revisar"
            subpasta.mkdir()
            (subpasta / "ignorada.jpg").touch()
            (pasta / "solta.jpg").touch()

            encontrados = listar_imagens_soltas(pasta)

            self.assertEqual(
                [arquivo.name for arquivo in encontrados],
                ["solta.jpg"],
            )


class TestStatus(unittest.TestCase):
    def test_preserva_protocolo_status_json(self):
        self.assertEqual(
            serializar_status(
                "arquivo_concluido",
                mensagem="Ação concluída.",
            ),
            'STATUS_JSON:{"etapa": "arquivo_concluido", '
            '"mensagem": "Ação concluída."}',
        )


class TestLogClassificacao(unittest.TestCase):
    def test_registra_inicio_fim_e_duracao_sem_repetir_cabecalho(self):
        with tempfile.TemporaryDirectory() as diretorio:
            inicio = datetime(2026, 1, 2, 10, 30, tzinfo=timezone.utc)
            fim = inicio + timedelta(seconds=75.25)

            caminho = registrar_tempo_classificacao(
                diretorio,
                "execucao-1",
                "HOTEL ÁGUA FRESCA",
                inicio,
                fim,
                [
                    {"nome": "foto 1.jpg", "bytes": 1500},
                    {"nome": "foto 2.jpg", "bytes": 2500},
                ],
                2,
            )
            registrar_tempo_classificacao(
                diretorio,
                "execucao-1",
                "HOTEL SOMBRA",
                fim,
                fim + timedelta(seconds=10),
                [{"nome": "foto 3.jpg", "bytes": 500}],
                2,
            )

            with caminho.open(encoding="utf-8-sig", newline="") as arquivo:
                registros = list(csv.DictReader(arquivo, delimiter=";"))

            self.assertEqual(len(registros), 2)
            self.assertEqual(registros[0]["hotel"], "HOTEL ÁGUA FRESCA")
            self.assertEqual(registros[0]["duracao_segundos"], "75.250")
            self.assertEqual(registros[0]["numero_imagens"], "2")
            self.assertEqual(registros[0]["tamanho_total_bytes"], "4000")
            self.assertEqual(registros[0]["numero_hoteis"], "2")
            self.assertIn('"nome":"foto 1.jpg"', registros[0]["tamanhos_imagens_bytes"])
            self.assertEqual(registros[0]["status"], "concluido")


if __name__ == "__main__":
    unittest.main()
