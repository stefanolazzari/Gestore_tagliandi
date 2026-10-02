# Gestore tagliandi

## Prerequisiti

- Node.js e npm
- Docker e Docker Compose

## Avvio del progetto

1. Installare le dipendenze:

	```bash
	npm install
	```

2. Avviare il container MySQL in background:

	```bash
	docker compose up -d mysql
	```

3. Controllare che il container sia attivo:

	```bash
	docker compose ps
	```

	Il servizio `mysql` deve avere stato `Up`.

4. Verificare che MySQL accetti connessioni:

	```bash
	docker exec mysql-dev mysqladmin ping -uutente -ppassword
	```

	Il risultato atteso è `mysqld is alive`.

5. Avviare l’applicazione in un terminale:

	```bash
	npm run dev
	```

	Il comando avvia MySQL, attende che accetti connessioni (fino a 30 secondi) e avvia il server. L’app sarà disponibile su <http://localhost:3000>.

## Test dell’app e del database

Con l’applicazione in esecuzione, verificare la connessione al database:

```bash
curl http://localhost:3000/api/health
```

Risultato atteso:

```json
{"status":"ok","database":"connected"}
```

Per controllare direttamente le tabelle del database:

```bash
docker exec -it mysql-dev mysql -uutente -ppassword -Dmiodb
```

Nella console MySQL eseguire:

```sql
SHOW TABLES;
DESCRIBE interventi;
SELECT COUNT(*) FROM interventi;
SELECT * FROM interventi;
```

La tabella `interventi` viene creata automaticamente all’avvio di `server.js`.
Viene creata anche la tabella `Clienti`, inizializzata con i clienti già presenti negli interventi. I nuovi interventi aggiornano la rubrica; il pulsante **Rubrica** nel modulo consente di selezionare un cliente e compilare i relativi dati.

Nella sezione **Visualizza tutti gli interventi**, una ricerca immediata filtra gli interventi in base a qualsiasi campo visualizzato, come nome, targa, tipo di intervento o note. Il pulsante **Esporta in Excel** scarica in formato `.xlsx` solo i risultati corrispondenti al filtro corrente.
Nel pannello **Rubrica**, il pulsante **Esporta in Excel** scarica tutti i clienti registrati, con i relativi dati di contatto, in un file `.xlsx`.

## Log e arresto

Per visualizzare i log di MySQL:

```bash
docker compose logs -f mysql
```

Per arrestare il database:

```bash
docker compose stop mysql
```

Per arrestare e rimuovere il container senza cancellare i dati:

```bash
docker compose down
```

Il volume `mysql_data` conserva i dati del database tra gli avvii.