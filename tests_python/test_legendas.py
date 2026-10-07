import unittest

from python_organizador.legendas import (
    ajustar_legenda_en,
    ajustar_portugues_brasil,
    gerar_legendas_paralelas,
    montar_alt_text,
)
from python_organizador.nomes import limpar_para_nome_arquivo


class AjustarLegendaEnTest(unittest.TestCase):
    def test_room_depende_da_categoria(self):
        legenda = "A large room with rows of chairs."
        self.assertEqual(
            ajustar_legenda_en(legenda, "acomodacoes"),
            "A large bedroom with rows of chairs.",
        )
        self.assertEqual(
            ajustar_legenda_en(legenda, "gastronomia"),
            "A large restaurant hall with rows of chairs.",
        )
        self.assertEqual(ajustar_legenda_en(legenda, "_Revisar"), legenda)

    def test_room_composto_nao_muda(self):
        self.assertEqual(
            ajustar_legenda_en("A living room with a couch.", "acomodacoes"),
            "A living room with a couch.",
        )

    def test_plural_de_room(self):
        self.assertEqual(
            ajustar_legenda_en("Two rooms with a view.", "acomodacoes"),
            "Two bedrooms with a view.",
        )

    def test_remove_mesa_de_cabeceira(self):
        self.assertEqual(
            ajustar_legenda_en(
                "A hotel room with two beds and a night stand.", "acomodacoes"
            ),
            "A hotel bedroom with two beds.",
        )
        self.assertEqual(
            ajustar_legenda_en("A bed with a bedside table.", None),
            "A bed.",
        )

    def test_remove_is_are_antes_de_preposicao(self):
        self.assertEqual(
            ajustar_legenda_en("Three drinks are on a table.", None),
            "Three drinks on a table.",
        )
        self.assertEqual(
            ajustar_legenda_en("A man is pouring a drink.", None),
            "A man is pouring a drink.",
        )


class AjustesPtExtrasTest(unittest.TestCase):
    def test_escorregador(self):
        self.assertEqual(
            ajustar_portugues_brasil("Uma piscina com um slide."),
            "Uma piscina com um escorregador.",
        )
        self.assertEqual(
            ajustar_portugues_brasil("Um parque com um deslizamento e balanços."),
            "Um parque com um escorregador e balanços.",
        )
        self.assertEqual(
            ajustar_portugues_brasil("Uma piscina com um deslizamento de água."),
            "Uma piscina com um toboágua.",
        )


class GlossarioHotelTest(unittest.TestCase):
    def test_termos_de_hotel(self):
        casos = {
            "Uma praia com cadeiras de gramado azuis.":
                "Uma praia com espreguiçadeiras azuis.",
            "Uma praia bordada de palmeiras.": "Uma praia cercada de palmeiras.",
            "Uma vista do oceano a partir de um convés.":
                "Uma vista do oceano a partir de um deck.",
            "Uma caminhada que leva a uma praia.":
                "Uma passarela que leva a uma praia.",
            "Um grande salão de restaurantes.": "Um grande salão de restaurante.",
            "Uma praia com guarda-chuvas.": "Uma praia com guarda-sóis.",
            "Um banheiro com um banho de caminhada.":
                "Um banheiro com um chuveiro.",
        }
        for entrada, esperado in casos.items():
            self.assertEqual(ajustar_portugues_brasil(entrada), esperado)

    def test_remove_pronome_solto_no_fim(self):
        self.assertEqual(
            ajustar_portugues_brasil("Um salão com filas de cadeiras nele."),
            "Um salão com filas de cadeiras.",
        )
        self.assertEqual(
            ajustar_portugues_brasil("Um salão com filas de cadeiras nele"),
            "Um salão com filas de cadeiras",
        )


class MontarAltTextTest(unittest.TestCase):
    def test_descricao_mais_hotel(self):
        self.assertEqual(
            montar_alt_text(
                "Um quarto de hotel com duas camas.",
                "EL ARAM IMIRÁ BEACH RESORT",
            ),
            "Quarto de hotel com duas camas em EL ARAM IMIRÁ BEACH RESORT",
        )

    def test_respeita_limite_sem_cortar_palavra(self):
        alt = montar_alt_text(
            "Uma mesa com " + "comida muito variada " * 10,
            "HOTEL TESTE",
            limite=60,
        )
        self.assertLessEqual(len(alt), 60)
        self.assertTrue(alt.endswith(" em HOTEL TESTE"))
        self.assertNotIn("  ", alt)

    def test_sem_descricao_nao_gera_alt(self):
        self.assertEqual(montar_alt_text("", "HOTEL"), "")

    def test_sem_hotel_devolve_so_a_descricao(self):
        self.assertEqual(montar_alt_text("Uma piscina.", ""), "Piscina")


class LimparNomeArquivoTest(unittest.TestCase):
    def test_remove_ponto_final(self):
        self.assertEqual(
            limpar_para_nome_arquivo("Um quarto de hotel com duas camas."),
            "um quarto de hotel com duas camas",
        )


class AjustarPortuguesBrasilTest(unittest.TestCase):
    def test_troca_formas_de_portugal(self):
        self.assertEqual(
            ajustar_portugues_brasil("Duas camas grandes num quarto."),
            "Duas camas grandes em um quarto.",
        )
        self.assertEqual(
            ajustar_portugues_brasil("Uma cozinha com frigorífico."),
            "Uma cozinha com geladeira.",
        )

    def test_preserva_maiuscula_inicial(self):
        self.assertEqual(
            ajustar_portugues_brasil("Numa varanda com vista."),
            "Em uma varanda com vista.",
        )

    def test_nao_altera_palavras_parecidas(self):
        self.assertEqual(
            ajustar_portugues_brasil("Um numeral e um número."),
            "Um numeral e um número.",
        )


class GerarLegendasParalelasTest(unittest.TestCase):
    def test_mantem_ordem_e_isola_erros(self):
        def gerar(arquivo):
            if arquivo == 2:
                raise ValueError("falha do modelo")
            return f"en{arquivo}"

        resultados = []
        for futuro in gerar_legendas_paralelas(
            range(6), gerar, lambda texto, item: texto.replace("en", "pt")
        ):
            try:
                resultados.append(futuro.result())
            except ValueError as erro:
                resultados.append(f"erro:{erro}")

        self.assertEqual(
            resultados,
            ["pt0", "pt1", "erro:falha do modelo", "pt3", "pt4", "pt5"],
        )


if __name__ == "__main__":
    unittest.main()
