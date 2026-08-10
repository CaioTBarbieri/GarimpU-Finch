import tempfile
import unittest
from pathlib import Path

from python_organizador.arquivos import (
    escrever_alt_texts,
    listar_hoteis,
    listar_imagens_categorizadas,
    listar_imagens_soltas,
)
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

    def test_lista_imagens_ja_categorizadas_com_nome_antigo(self):
        with tempfile.TemporaryDirectory() as diretorio:
            hotel = Path(diretorio) / "Jericoacoara" / "Hotel"
            categoria = hotel / "Acomodações"
            categoria.mkdir(parents=True)
            imagem = categoria / "foto antiga.jpg"
            imagem.touch()

            encontrados = listar_imagens_categorizadas(
                hotel,
                ["acomodacoes", "gastronomia"],
            )

            self.assertEqual(encontrados, {imagem: "acomodacoes"})
            self.assertEqual(
                listar_hoteis(diretorio, ["acomodacoes"]),
                [hotel],
            )

    def test_reconhece_erro_de_digitacao_da_categoria_entretenimento(self):
        with tempfile.TemporaryDirectory() as diretorio:
            hotel = Path(diretorio) / "Jericoacoara" / "Hotel"
            categoria = hotel / "entreterimento"
            categoria.mkdir(parents=True)
            imagem = categoria / "foto antiga.jpg"
            imagem.touch()

            encontrados = listar_imagens_categorizadas(
                hotel,
                ["entretenimento"],
            )

            self.assertEqual(encontrados, {imagem: "entretenimento"})

    def test_encontra_hoteis_com_imagens_soltas_dentro_de_pastas_maes(self):
        with tempfile.TemporaryDirectory() as diretorio:
            raiz = Path(diretorio)
            hotel_itacare = raiz / "Itacaré" / "Hotel Praia"
            hotel_jeri = raiz / "Jericoacoara" / "Hotel Duna"
            hotel_itacare.mkdir(parents=True)
            hotel_jeri.mkdir(parents=True)
            (hotel_itacare / "foto.jpg").touch()
            (hotel_jeri / "foto.png").touch()

            encontrados = listar_hoteis(raiz)

            self.assertEqual(
                set(encontrados),
                {hotel_itacare, hotel_jeri},
            )

    def test_nao_confunde_pasta_de_categoria_com_hotel(self):
        with tempfile.TemporaryDirectory() as diretorio:
            raiz = Path(diretorio)
            categoria = raiz / "Jericoacoara" / "Hotel" / "Gastronomia"
            categoria.mkdir(parents=True)
            (categoria / "foto.jpg").touch()

            self.assertEqual(listar_hoteis(raiz), [])

    def test_preserva_alt_texts_existentes_ao_escrever(self):
        with tempfile.TemporaryDirectory() as diretorio:
            pasta = Path(diretorio)
            escrever_alt_texts(pasta, {"antiga.jpg": "Descrição antiga"})
            escrever_alt_texts(pasta, {"nova.jpg": "Descrição nova"})

            conteudo = (pasta / "alt_texts.json").read_text(encoding="utf-8")
            self.assertIn('"antiga.jpg": "Descrição antiga"', conteudo)
            self.assertIn('"nova.jpg": "Descrição nova"', conteudo)


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


if __name__ == "__main__":
    unittest.main()
