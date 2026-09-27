# Bella Make

Loja local de maquiagem e produtos de beleza. HTML, CSS e JavaScript sem frameworks; backend Node.js e banco SQLite. Nome, produtos, preços e estoque são exemplos editáveis. Não há dependências externas para instalar.

## Abrir e executar

1. Abra esta pasta no Visual Studio Code.
2. No menu **Terminal → Novo Terminal**, digite `npm start`.
3. Abra **http://localhost:3000** no navegador.

Requer Node.js 22.13 ou mais recente. O aviso de API SQLite experimental em Node 22 é esperado. O servidor aceita conexões apenas neste computador. Para parar, pressione Ctrl+C no terminal que o iniciou.

## O que está funcionando

- Catálogo com oito produtos de exemplo, busca por nome/marca/categoria, filtros e ordenação.
- Detalhes de produto, favoritos e sacola persistidos no navegador.
- Quantidades, remoção de itens e cupom demonstrativo **BELLA10** (10%).
- Cadastro e login, senha com scrypt e salt, cookie HttpOnly e expiração de sessão.
- Pedido com endereço e preferência de pagamento, histórico por usuário e estoque atualizado em transação.
- Preços, descontos e estoque conferidos pelo servidor; repetição do mesmo pedido não duplica a reserva.
- Layout para computador e celular, modais com suporte a teclado, formulários rotulados e estados de erro.

## Onde editar

| Arquivo | Conteúdo |
| --- | --- |
| `public/index.html` | Estrutura, nome da loja, textos, navegação e formulários |
| `public/styles.css` | Cores, tamanhos, espaços e adaptação para celular |
| `public/app.js` | Interações do navegador |
| `catalog.json` | Produtos: nomes, preços, imagens e descrições |
| `server.js` | API, autenticação, pedidos e banco |
| `public/images/` | Suas fotos |

Os preços são em **centavos**: 1990 = R$ 19,90. Coloque a foto em `public/images/gloss.jpg` e use `"image": "/images/gloss.jpg"` no produto. Reinicie o servidor para carregar as mudanças do catálogo. Campos de texto devem permanecer em JSON válido.

O estoque de `catalog.json` é usado apenas ao cadastrar o produto pela primeira vez. Depois, o estoque real da demonstração fica em SQLite e não é sobrescrito ao reiniciar. Para ajustar um produto existente, atualize a coluna `stock` na tabela `products` com uma ferramenta de SQLite, após fazer backup. Não há painel administrativo nesta versão.

Para inserir uma foto no banner, adicione ao fim de `public/styles.css`:

```css
.hero {
  background-image: linear-gradient(90deg, #211521bb, #21152122), url('/images/banner.jpg');
}
```

## Dados locais

O banco é criado automaticamente em `data/store.sqlite`. Essa pasta contém contas e pedidos e não deve ser publicada nem enviada com o código. Faça backup com o servidor parado. Os arquivos SQLite auxiliares fazem parte do banco enquanto ele está em execução. O navegador guarda favoritos e sacola localmente.

## Antes de vender de verdade

Esta é uma **demonstração funcional local**. Não processa pagamentos, não calcula frete real, não envia e-mails e não realiza entregas. Pedidos de demonstração reduzem o estoque local. Não insira dados pessoais reais durante testes.

Para operação comercial: integrar um provedor de pagamento com checkout hospedado e confirmação por webhook; integrar cálculo de entrega; configurar hospedagem HTTPS, cookie Secure e origens permitidas; definir catálogo real, dados da empresa, atendimento e políticas; adicionar administração com autorização, recuperação de senha, verificações de e-mail, cancelamentos e reposição de estoque, proteção contra abuso e rotina de backup. Nunca marque um pedido como pago a partir de uma resposta enviada pelo navegador.

## Testes

Execute `npm test`. A suíte inicia um servidor separado e usa um banco temporário para testar cadastro, autenticação, preços no servidor, desconto, estoque, isolamento de pedidos, repetição segura e bloqueio de arquivos privados. Não altera o banco da loja.

## Rotas da API

- `GET /api/products`: catálogo público.
- `GET /api/me`: usuário da sessão.
- `POST /api/register`: nome, e-mail e senha.
- `POST /api/login`, `POST /api/logout`: sessão.
- `GET /api/orders`: pedidos da conta conectada.
- `POST /api/orders`: itens (`id`, `quantity`), endereço, preferência `pix`/`card`, cupom e `requestId` único.

Variáveis opcionais: `PORT` (padrão 3000) e `DATA_DIR` (padrão `data/`).
