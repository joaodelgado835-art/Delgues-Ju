# Julia Amorim · Atelier de Unhas

Site com agendamento sem conta, backend Node.js e banco SQLite persistente.

## Abrir no computador

1. Dê dois cliques em **INICIAR.cmd**. Mantenha essa janela aberta.
2. Abra **http://127.0.0.1:3000**.
3. Para gerenciar, abra **http://127.0.0.1:3000/admin**.
4. A chave privada do painel está no arquivo **data/admin-token.txt**, criado na primeira inicialização. Copie seu conteúdo no campo do painel. Não compartilhe esse arquivo.

Se o site já estiver aberto e funcionando, não é necessário iniciar outra vez.

No terminal do VS Code: `node src/server.mjs`. Requer Node.js 22.13 ou superior. Não precisa instalar pacotes.

## Catálogo informado pela Julia

| Procedimento | Valor |
|---|---:|
| Fibras de Vidro | R$ 150,00 |
| Molde F1 | R$ 120,00 |
| Banho de Gel | R$ 110,00 |
| Soft gel | R$ 100,00 |
| Manutenção Fibra de Vidro | R$ 120,00 |
| Manutenção de Gel | R$ 100,00 |
| Manutenção soft gel | R$ 80,00 |
| Reposição Unha de Gel | R$ 7,00 por unha |
| Pedicure russa | R$ 70,00 |
| Spa dos pés | R$ 100,00 |
| Pedicure tradicional | R$ 30,00 |
| Remoção Alongamento | R$ 30,00 |

As quatro aplicações incluem esmaltação em gel e cuticulagem russa.
Nail art como adicional: nível I R$ 30; II R$ 40; III R$ 60; IV R$ 70; V R$ 80.
Reposição permite escolher de 1 a 10 unhas. Preços e adicionais são recalculados no servidor.

## Pagamento e contato

- **Chave Pix: 84981870533**, preservada exatamente como informada.
- **WhatsApp: (84) 99902-1993**. O telefone de contato não é usado para receber Pix.
- A cliente copia a chave, informa o valor do sinal no aplicativo do banco e envia a imagem do comprovante.
- O site não acessa contas bancárias, não valida a titularidade da chave e não confirma crédito automaticamente.
- No painel, Julia abre o comprovante, confere o crédito no banco e confirma a reserva.
- Nenhum pagamento real foi feito nos testes. A confirmação bancária automática depende da contratação/configuração da API do banco ou provedor que atende a conta recebedora; ela não está implementada nesta versão.
- Cancelamento no site libera o horário, mas não devolve dinheiro. A devolução deve ser combinada e feita pelo banco.

## Regras adotadas, ainda ajustáveis

- Agenda para hoje até 10 dias à frente, segunda a sábado, das 9h às 18h, horário de Brasília.
- Antecedência mínima de uma hora.
- Sinal de 50% em todas as reservas; restante no atendimento.
- Sem comprovante em 30 minutos: a reserva expira e o horário é liberado na próxima consulta.
- Comprovante enviado: horário continua separado até a conferência da profissional. Não há confirmação automática nem liberação automática durante a conferência.
- **Os tempos são estimativas, pois o catálogo não informa duração.** Revise `duration` em `src/catalog.mjs` com Julia antes do uso real: aplicações de 120 a 180 min, manutenções de 120 a 150 min, reposição 30 min por unha, pedicures e spa de 60 a 90 min, remoção 60 min, nail art adicional de 30 a 90 min.
- As fotos são inspirações geradas com IA. Não são resultados de clientes.
- Depoimentos inventados foram removidos. Avaliações reais usam o link privado da reserva e só são aceitas após Julia marcar o atendimento como concluído. Publicação passa pelo painel; notas baixas são aceitas.

## Arquivos e dados

- `src/catalog.mjs`: catálogo, preços, contato, Pix e regras.
- `src/server.mjs`: API, acesso privado, comprovantes e servidor HTTP.
- `src/database.mjs`: estrutura, migrações e transações SQLite.
- `public/`: páginas, estilos, scripts e imagens.
- `data/atelier.sqlite`: banco persistente; `data/receipts/`: comprovantes privados.
- `data/admin-token.txt`: chave privada do painel, nunca servida pela aplicação.
- `.vscode/tasks.json`: tarefas para iniciar e testar pelo VS Code.

Guarde o link privado de cada reserva; ele permite acessar os dados daquela cliente sem conta. O navegador não armazena a chave do painel permanentemente.
Para backup, pare o servidor e copie a pasta `data` inteira para um local protegido. Não coloque essa pasta em hospedagem estática nem em repositório público. Há telefone, comprovantes e segredos nela.

## Verificação

Execute `node --test tests/booking.test.mjs`.
Testes com banco real separado, usando dados artificiais em `../../work/tests`, cobrem: preços do catálogo; adicionais e quantidade; datas; reservas concorrentes; sobreposição; privacidade; acesso ao painel; confirmação condicionada ao comprovante e conferência; expiração; cancelamento; avaliações e persistência.

## Colocar na internet

Esta entrega está funcionando **localmente**. O endereço 127.0.0.1 só funciona neste computador. A publicação pelo serviço integrado não estava disponível e o instalador do modelo inicial falhou na verificação de certificado. A entrega atual usa recursos nativos do Node e não depende desse modelo.

Para disponibilizar às clientes, precisa de hospedagem Node.js com volume persistente, HTTPS, domínio e processo mantido em execução. Configure `PORT`, `HOST`, `DATA_DIR` e `ADMIN_TOKEN` no ambiente privado da hospedagem. O padrão `HOST=127.0.0.1` mantém a prévia apenas no computador; em hospedagem use a interface exigida pelo provedor. Use uma única instância com o banco local, backups e limites de tráfego na entrada. O limitador local usa o endereço de rede direto e precisa ser revisto se houver proxy compartilhado.

Antes da abertura ao público, confirme com Julia duração, expediente, regra do sinal, política de cancelamento, localização do atendimento e recebimento na chave Pix. A política de retenção/exclusão de dados e a recuperação de links perdidos ainda dependem da operação de Julia; o painel não tem envio automático de mensagens, feriados, bloqueios manuais ou estorno bancário.

Referência de pagamento: [Banco Central — como receber um Pix](https://bcb.gov.br/meubc/faqs/p/como-receber-um-pix).
