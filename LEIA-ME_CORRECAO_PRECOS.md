# Correção dos preços dos Rolls

## 1. Atualizar o banco

1. Abra o painel do Supabase do sistema.
2. Entre em **SQL Editor** e clique em **New query**.
3. Abra o arquivo `supabase/migrations/20260818000000_corrige_precos_rolls.sql`.
4. Copie todo o conteúdo, cole no SQL Editor e clique em **Run**.
5. O resultado deve indicar execução concluída sem erro.

Esse SQL é seguro para ser executado uma vez na base atual. Ele mantém os itens antigos com suas datas históricas, passa a usar os preços atuais para peças incluídas hoje em Rolls antigos e faz a atualização manual respeitar o valor escolhido.

## 2. Publicar o site corrigido

Publique os arquivos desta versão normalmente pelo GitHub/Lovable/Vercel. Não substitua o seu `.env` pelos arquivos do ZIP; mantenha as variáveis que já estão configuradas no projeto ou na Vercel.

## 3. Corrigir o COBERTOR do Roll 4289

1. Abra **Preços dos Clientes**.
2. Selecione **HOTEL INTERNACIONAL**.
3. Confirme que COBERTOR está com valor normal de **18,00**.
4. Clique em **Aplicar nos rolls** na linha do COBERTOR.
5. Marque o Roll **4289** e clique em **Alterar 1 roll**.

## 4. Incluir COBRE MANCHA no Roll 4670

Depois de executar o SQL e publicar o site, abra novamente o Roll 4670 e inclua COBRE MANCHA. Mesmo o Roll sendo de 12/08/2026, a peça usará o preço vigente no dia da inclusão.

## 5. Percentuais do resumo

Nos cartões da tela **Roll Alyani**, a Receita aparece como 100,00%. Custos e Lucro aparecem ao lado dos valores em reais, calculados sobre a Receita e arredondados para duas casas decimais.
