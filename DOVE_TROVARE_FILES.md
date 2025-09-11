# 📁 Dove Trovare i File del Sistema di Gestione Ristorante

## 🎯 File Principali da Scaricare

### 📦 Progetto Completo
**Posizione:** Tutto il workspace corrente di Replit
- Clicca su **"Download as ZIP"** dal menu Three Dots (⋯) in alto a sinistra
- Oppure usa `git clone` se disponibile

### 📋 File di Configurazione Chiave

| File | Posizione | Descrizione |
|------|-----------|-------------|
| `package.json` | Root del progetto | Dipendenze e script |
| `electron-builder.config.js` | Root | Configurazione packaging desktop |
| `GUIDA_INSTALLAZIONE.md` | Root | Questa guida in italiano |
| `server/index.ts` | `server/` | Server Express principale |
| `client/src/App.tsx` | `client/src/` | App React principale |

## 🚀 File Già Pronti per il Packaging

### 📱 Applicazione Web (Pronta)
**Cartella:** `dist/`
- **Cosa contiene:** App compilata per produzione
- **Come usare:** 
  ```bash
  npm run build  # Crea la cartella dist/
  npm start      # Avvia versione produzione
  ```

### 🖥️ Applicazione Desktop (Pronta)
**Cartella:** `electron/`
- **File principali:**
  - `main.js` - Processo principale Electron
  - `preload.js` - Script di sicurezza
- **Come usare:**
  ```bash
  npm run build
  npx electron .
  ```

## 📦 Creare Pacchetti Installazione (Su Windows)

### Sul Tuo Computer Windows

1. **Scarica tutto il progetto** da Replit
2. **Installa Node.js** (versione 18+)
3. **Apri PowerShell** nella cartella progetto
4. **Installa dipendenze:**
   ```bash
   npm install
   ```
5. **Builda l'app:**
   ```bash
   npm run build
   ```
6. **Crea pacchetti:**
   ```bash
   # Installer MSI (Windows professionale)
   npx electron-builder --win msi
   
   # Installer classico Windows
   npx electron-builder --win nsis
   
   # App portabile (senza installazione)
   npx electron-builder --win portable
   ```

### 📥 Dove Trovi i Pacchetti Creati
**Cartella:** `dist-electron/`

Dopo il build troverai:
- `RestaurantManager-1.0.0.msi` - Installer MSI
- `RestaurantManager-1.0.0.exe` - Installer NSIS  
- `RestaurantManager-1.0.0-portable.exe` - App portabile

## 🔧 File di Build Necessari

### Per Packaging Completo
Questi file sono già inclusi nel progetto:

| File | Funzione |
|------|----------|
| `build-resources/icon.ico` | Icona Windows |
| `build-resources/installer.nsh` | Script installer personalizzato |
| `LICENSE.txt` | Licenza software |
| `electron-builder.config.js` | Configurazione completa build |

## 📂 Struttura Cartelle Importante

```
restaurant-management/
├── dist/                    # App web compilata
├── electron/               # File Electron desktop
├── client/                 # Codice frontend React
├── server/                 # Codice backend Express  
├── shared/                 # Schemi database condivisi
├── build-resources/        # Risorse per packaging
├── package.json           # Configurazione NPM
└── GUIDA_INSTALLAZIONE.md # Questa guida!
```

## ⚡ Soluzioni Rapide

### 🎯 Per Test Immediato
**Cosa scaricare:** Solo il progetto completo
**Cosa fare:**
```bash
npm install
npm run dev
# Vai su http://localhost:5000
```

### 🏢 Per Installazione Aziendale  
**Cosa scaricare:** Progetto completo + creare MSI
**Cosa fare:**
```bash
npm install
npm run build
npx electron-builder --win msi
# Distribuisci il file .msi creato
```

### 📱 Per Demo Mobile
**Cosa usare:** Solo browser web
**Come:** Accedi direttamente a Replit URL:
- POS: `[replit-url]/pos`
- Cucina: `[replit-url]/kitchen`  
- Cliente: `[replit-url]/customer`

## 🔄 Aggiornamenti Futuri

### File da Modificare
- **Menu:** `server/storage.ts` (sezione SEED_DATA)
- **Prezzi:** Stessa posizione
- **Tasse:** `client/src/components/PosInterface.tsx`
- **Stili:** `client/src/index.css`

### Backup Configurazioni
Prima di modifiche importanti:
```bash
# Backup file chiave
cp server/storage.ts server/storage.ts.backup
cp client/src/components/PosInterface.tsx client/src/components/PosInterface.tsx.backup
```

---

**💡 Nota:** Tutti i file sono già configurati e pronti all'uso. La maggior parte degli utenti avrà bisogno solo del download completo del progetto e seguire la GUIDA_INSTALLAZIONE.md.

**🎯 Per supporto:** Tutti i file includono commenti dettagliati in italiano per facilitare modifiche future.