# 🍽️ Sistema di Gestione Ristorante - Guida Installazione

## 📋 Panoramica
Sistema completo di gestione ristorante con interfacce multiple:
- **POS (Point of Sale)** - Terminale per prendere ordini
- **Display Cucina** - Monitor per la preparazione  
- **Monitor Cliente** - Schermo per lo stato ordini
- **Pannello Amministrativo** - Analytics e gestione
- **Interfaccia Delivery** - Per le consegne

## 🚀 Installazione Rapida (Consigliata)

### Opzione 1: Esecuzione Diretta 
La più semplice per test immediati:

1. **Scarica il progetto** da Replit
2. **Installa Node.js** (versione 18 o superiore) da [nodejs.org](https://nodejs.org)
3. **Apri il terminale** nella cartella del progetto
4. **Installa le dipendenze:**
   ```bash
   npm install
   ```
5. **Avvia l'applicazione:**
   ```bash
   npm run dev
   ```
6. **Apri il browser** e vai su: `http://localhost:5000`

### Opzione 2: Applicazione Desktop (Windows)
Per un'esperienza più professionale:

1. **Completa l'Opzione 1** prima
2. **Crea l'applicazione desktop:**
   ```bash
   npm run build
   npx electron .
   ```

## 🌐 Configurazione Multi-Terminale

### Setup Rete Locale
Per utilizzare multiple postazioni (POS, Cucina, Cliente):

1. **Server Principale** (1 computer):
   ```bash
   npm run dev
   ```
   Segna l'indirizzo IP mostrato (es: `192.168.1.100:5000`)

2. **Terminali Aggiuntivi** (altri computer):
   - Apri browser su: `http://[IP-SERVER]:5000`
   - Esempio: `http://192.168.1.100:5000`

### Accesso Interfacce Specifiche

| Interfaccia | URL | Dispositivo Consigliato |
|-------------|-----|-------------------------|
| **POS** | `/pos` | Tablet/Desktop |
| **Display Cucina** | `/kitchen` o `/kds` | Monitor Grande |
| **Monitor Cliente** | `/customer` | TV/Monitor Pubblico |
| **Amministrazione** | `/admin` | Desktop/Laptop |
| **Delivery** | `/delivery` | Smartphone |

## 📱 Configurazione per Dispositivo

### POS (Cassa)
- **URL:** `http://[IP]:5000/pos`
- **Dispositivo:** Tablet o Desktop touch
- **Risoluzione:** 1024x768 o superiore

### Display Cucina  
- **URL:** `http://[IP]:5000/kitchen`
- **Dispositivo:** Monitor 24" o superiore
- **Orientamento:** Orizzontale
- **Risoluzione:** 1920x1080 consigliata

### Monitor Cliente
- **URL:** `http://[IP]:5000/customer`  
- **Dispositivo:** TV o monitor pubblico
- **Modalità:** Fullscreen (F11)
- **Auto-refresh:** Automatico

## ⚙️ Configurazione Database

### Setup Automatico (Default)
L'app utilizza un database in memoria per test:
```bash
npm run dev
```
I dati di esempio vengono caricati automaticamente.

### Database PostgreSQL (Produzione)
Per dati persistenti:

1. **Configura DATABASE_URL** nel file `.env`:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/restaurant
   ```

2. **Sincronizza schema:**
   ```bash
   npm run db:push
   ```

## 🔧 Risoluzione Problemi

### L'applicazione non si avvia
```bash
# Pulisci la cache e reinstalla
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Errori di connessione rete
1. **Controlla il firewall** - Porta 5000 deve essere aperta
2. **Verifica l'IP** - Usa `ipconfig` (Windows) o `ifconfig` (Mac/Linux)
3. **Testa connessione:** `ping [IP-SERVER]`

### Display cucina non si aggiorna
1. **Refresh pagina** (F5)
2. **Controlla console** browser (F12)
3. **Riavvia server** se necessario

## 📋 Menu di Esempio

Il sistema include menu pre-configurato:

**🍕 Pizza**
- Margherita (€8.00)
- Marinara (€6.50) 
- Quattro Stagioni (€13.00)

**🍝 Pasta**
- Carbonara (€10.00)
- Amatriciana (€9.50)

**🥤 Bevande**  
- Acqua (€2.00)
- Coca Cola (€3.00)
- Birra (€4.50)

## 🔒 Sicurezza e Backup

### Backup Dati
```bash
# Esporta configurazione menu
curl http://localhost:5000/api/menu > backup-menu.json

# Esporta ordini giornalieri  
curl http://localhost:5000/api/orders/today > backup-orders.json
```

### Reset Sistema
Per ricominciare da capo:
```bash
# Ferma l'applicazione (Ctrl+C)
# Riavvia
npm run dev
```

## 📞 Supporto

### Log degli Errori
I log si trovano nella console del browser (F12) e nel terminale.

### Test delle Funzionalità
1. **POS**: Aggiungi articoli al carrello, invia in cucina
2. **Cucina**: Visualizza ordini, cambia stato preparazione  
3. **Cliente**: Controlla aggiornamenti in tempo reale

### Configurazioni Avanzate
- **Porta personalizzata:** Modifica in `server/index.ts`
- **Tasse:** Configurabili nel POS (default 22%)
- **Stampa ricevute:** Configurazione stampante in `/admin`

## ✅ Checklist Pre-Apertura

- [ ] Server principale avviato
- [ ] Tutti i terminali collegati
- [ ] Menu verificato e aggiornato
- [ ] Stampante ricevute configurata
- [ ] Backup dati effettuato
- [ ] Test ordine completo (POS → Cucina → Cliente)

---

**💡 Suggerimento:** Inizia sempre con l'Opzione 1 per verificare che tutto funzioni, poi passa alla configurazione multi-terminale.

**🎯 Per assistenza immediata:** Controlla i log del browser (F12) e del terminale per messaggi di errore specifici.