import { useState, useEffect } from 'react';

export type Language = 'it' | 'en';

interface Translations {
  [key: string]: {
    it: string;
    en: string;
  };
}

const translations: Translations = {
  // Common
  'app.title': { it: 'Sistema di Gestione Ristorante', en: 'Restaurant Management System' },
  'common.save': { it: 'Salva', en: 'Save' },
  'common.cancel': { it: 'Annulla', en: 'Cancel' },
  'common.delete': { it: 'Elimina', en: 'Delete' },
  'common.edit': { it: 'Modifica', en: 'Edit' },
  'common.add': { it: 'Aggiungi', en: 'Add' },
  'common.search': { it: 'Cerca', en: 'Search' },
  'common.filter': { it: 'Filtra', en: 'Filter' },
  'common.loading': { it: 'Caricamento...', en: 'Loading...' },
  'common.error': { it: 'Errore', en: 'Error' },
  'common.success': { it: 'Successo', en: 'Success' },
  'common.close': { it: 'Chiudi', en: 'Close' },
  'common.confirm': { it: 'Conferma', en: 'Confirm' },
  'common.back': { it: 'Indietro', en: 'Back' },
  'common.next': { it: 'Avanti', en: 'Next' },
  'common.yes': { it: 'Sì', en: 'Yes' },
  'common.no': { it: 'No', en: 'No' },

  // Authentication
  'auth.login': { it: 'Accedi', en: 'Sign In' },
  'auth.logout': { it: 'Esci', en: 'Logout' },
  'auth.welcome': { it: 'Benvenuto', en: 'Welcome' },

  // Navigation
  'nav.pos': { it: 'Terminale POS', en: 'POS Terminal' },
  'nav.kitchen': { it: 'Display Cucina', en: 'Kitchen Display' },
  'nav.customer': { it: 'Monitor Cliente', en: 'Customer Monitor' },
  'nav.admin': { it: 'Pannello Admin', en: 'Admin Panel' },

  // POS Interface
  'pos.current_order': { it: 'Ordine Corrente', en: 'Current Order' },
  'pos.select_table': { it: 'Seleziona Tavolo', en: 'Select Table' },
  'pos.send_to_kitchen': { it: 'Invia in Cucina', en: 'Send to Kitchen' },
  'pos.payment': { it: 'Pagamento', en: 'Payment' },
  'pos.add_note': { it: 'Aggiungi Nota', en: 'Add Note' },
  'pos.split_bill': { it: 'Dividi Conto', en: 'Split Bill' },
  'pos.order_notes': { it: 'Note Ordine', en: 'Order Notes' },
  'pos.subtotal': { it: 'Subtotale', en: 'Subtotal' },
  'pos.tax': { it: 'IVA (22%)', en: 'Tax (22%)' },
  'pos.total': { it: 'Totale', en: 'Total' },
  'pos.table': { it: 'Tavolo', en: 'Table' },
  'pos.seats': { it: 'posti', en: 'seats' },
  'pos.order_sent': { it: 'Ordine inviato in cucina', en: 'Order sent to kitchen' },
  'pos.order_sent_desc': { it: 'L\'ordine è stato inviato con successo in cucina.', en: 'The order has been successfully sent to the kitchen.' },
  'pos.no_table': { it: 'Nessun tavolo selezionato', en: 'No table selected' },
  'pos.select_table_msg': { it: 'Seleziona un tavolo prima di inviare l\'ordine.', en: 'Please select a table before sending the order.' },
  'pos.empty_order': { it: 'Ordine vuoto', en: 'Empty order' },
  'pos.add_items_msg': { it: 'Aggiungi articoli all\'ordine prima di inviare.', en: 'Please add items to the order before sending.' },

  // Kitchen Display
  'kds.title': { it: 'Sistema Display Cucina', en: 'Kitchen Display System' },
  'kds.station': { it: 'Postazione', en: 'Station' },
  'kds.all_stations': { it: 'Tutte le Postazioni', en: 'All Stations' },
  'kds.bar': { it: 'Bar', en: 'Bar' },
  'kds.pizza': { it: 'Pizza', en: 'Pizza' },
  'kds.kitchen': { it: 'Cucina', en: 'Kitchen' },
  'kds.dessert': { it: 'Dessert', en: 'Dessert' },
  'kds.grill': { it: 'Griglia', en: 'Grill' },
  'kds.fryer': { it: 'Friggitrice', en: 'Fryer' },
  'kds.cold_station': { it: 'Stazione Fredda', en: 'Cold Station' },
  'kds.live': { it: 'In Diretta', en: 'Live' },
  'kds.disconnected': { it: 'Disconnesso', en: 'Disconnected' },
  'kds.order': { it: 'Ordine', en: 'Order' },
  'kds.start': { it: 'Inizia', en: 'Start' },
  'kds.pause': { it: 'Pausa', en: 'Pause' },
  'kds.ready': { it: 'Pronto', en: 'Ready' },
  'kds.served': { it: 'Servito', en: 'Served' },
  'kds.queue': { it: 'Ordini in Coda', en: 'Orders in Queue' },
  'kds.preparing': { it: 'In Preparazione', en: 'In Preparation' },
  'kds.ready_to_serve': { it: 'Pronto da Servire', en: 'Ready to Serve' },
  'kds.avg_prep_time': { it: 'Tempo Prep. Medio (min)', en: 'Avg Prep Time (min)' },
  'kds.just_now': { it: 'Ora', en: 'Just now' },
  'kds.min_ago': { it: 'min fa', en: 'min ago' },

  // Customer Monitor
  'customer.title': { it: 'Stato Ordine', en: 'Order Status' },
  'customer.subtitle': { it: 'Segui il progresso del tuo ordine in tempo reale', en: 'Track your order progress in real-time' },
  'customer.live_updates': { it: 'Aggiornamenti in Diretta', en: 'Live Updates' },
  'customer.connecting': { it: 'Connessione...', en: 'Connecting...' },
  'customer.no_orders': { it: 'Nessun Ordine Attivo', en: 'No Active Orders' },
  'customer.no_orders_desc': { it: 'Tutti gli ordini sono stati serviti. Grazie!', en: 'All orders have been served. Thank you!' },
  'customer.order_number': { it: 'Numero Ordine', en: 'Order Number' },
  'customer.progress': { it: 'Progresso', en: 'Progress' },
  'customer.cooking': { it: 'Cottura in Corso', en: 'Cooking in Progress' },
  'customer.almost_ready': { it: 'Quasi Pronto!', en: 'Almost Ready!' },
  'customer.order_ready': { it: 'ORDINE PRONTO!', en: 'ORDER READY!' },
  'customer.collect': { it: 'Ritira dal bancone', en: 'Please collect from counter' },
  'customer.estimated_time': { it: 'Tempo stimato', en: 'Estimated time' },
  'customer.remaining_min': { it: 'min rimanenti', en: 'minutes remaining' },
  'customer.special_today': { it: 'Piatto del Giorno', en: 'Today\'s Special' },
  'customer.thank_you': { it: 'Grazie per aver cenato con noi! • Seguici @restaurant_social', en: 'Thank you for dining with us! • Follow us @restaurant_social' },

  // Admin Panel
  'admin.title': { it: 'Gestione Ristorante', en: 'Restaurant Management' },
  'admin.subtitle': { it: 'Pannello di controllo e analisi', en: 'Overview and analytics dashboard' },
  'admin.overview': { it: 'Panoramica', en: 'Overview' },
  'admin.orders': { it: 'Ordini', en: 'Orders' },
  'admin.tables': { it: 'Tavoli', en: 'Tables' },
  'admin.analytics': { it: 'Analisi', en: 'Analytics' },
  'admin.menu': { it: 'Menu', en: 'Menu' },
  'admin.inventory': { it: 'Magazzino', en: 'Inventory' },
  'admin.settings': { it: 'Impostazioni', en: 'Settings' },
  'admin.revenue_today': { it: 'Incasso di Oggi', en: 'Today\'s Revenue' },
  'admin.export_report': { it: 'Esporta Report', en: 'Export Report' },
  'admin.orders_today': { it: 'Ordini Oggi', en: 'Orders Today' },
  'admin.avg_order_value': { it: 'Valore Ordine Medio', en: 'Avg Order Value' },
  'admin.table_occupancy': { it: 'Tavoli Occupati', en: 'Tables Occupied' },
  'admin.occupancy': { it: 'occupazione', en: 'occupancy' },
  'admin.recent_orders': { it: 'Ordini Recenti', en: 'Recent Orders' },
  'admin.top_dishes': { it: 'Piatti Top Oggi', en: 'Top Dishes Today' },
  'admin.all_orders': { it: 'Tutti gli Ordini', en: 'All Orders' },
  'admin.table_status': { it: 'Stato Tavoli', en: 'Table Status' },
  'admin.daily_sales': { it: 'Vendite Giornaliere', en: 'Daily Sales Summary' },
  'admin.performance': { it: 'Metriche Performance', en: 'Performance Metrics' },
  'admin.total_revenue': { it: 'Ricavi Totali', en: 'Total Revenue' },
  'admin.orders_count': { it: 'Numero Ordini', en: 'Orders Count' },
  'admin.active_orders': { it: 'Ordini Attivi', en: 'Active Orders' },

  // Status
  'status.free': { it: 'Libero', en: 'Free' },
  'status.occupied': { it: 'Occupato', en: 'Occupied' },
  'status.closing': { it: 'In Chiusura', en: 'Closing' },
  'status.new': { it: 'Nuovo', en: 'New' },
  'status.preparing': { it: 'In Preparazione', en: 'Preparing' },
  'status.ready': { it: 'Pronto', en: 'Ready' },
  'status.served': { it: 'Servito', en: 'Served' },
  'status.paid': { it: 'Pagato', en: 'Paid' },
  'status.cancelled': { it: 'Annullato', en: 'Cancelled' },

  // Time
  'time.min': { it: 'min', en: 'min' },
  'time.minutes': { it: 'minuti', en: 'minutes' },
  'time.ready': { it: 'Pronto', en: 'Ready' },

  // Menu Categories
  'menu.appetizers': { it: 'Antipasti', en: 'Appetizers' },
  'menu.pizza': { it: 'Pizza', en: 'Pizza' },
  'menu.pasta': { it: 'Pasta', en: 'Pasta' },
  'menu.meat': { it: 'Carne', en: 'Meat' },
  'menu.fish': { it: 'Pesce', en: 'Fish' },
  'menu.desserts': { it: 'Dolci', en: 'Desserts' },
  'menu.beverages': { it: 'Bevande', en: 'Beverages' },
  'menu.wine': { it: 'Vino', en: 'Wine' },
  'menu.coffee': { it: 'Caffè', en: 'Coffee' },

  // Landing Page
  'landing.title': { it: 'Sistema Completo di Gestione Ristorante', en: 'Complete Restaurant Management System' },
  'landing.subtitle': { it: 'Ottimizza le operazioni del tuo ristorante con il nostro sistema completo POS, Display Cucina e Monitoraggio Cliente. Aggiornamenti in tempo reale, capacità offline e integrazione perfetta per la massima efficienza.', en: 'Streamline your restaurant operations with our comprehensive POS, Kitchen Display, and Customer Monitoring system. Real-time updates, offline capabilities, and seamless integration for maximum efficiency.' },
  'landing.get_started': { it: 'Inizia Ora', en: 'Get Started' },
  'landing.pos_desc': { it: 'Interfaccia ottimizzata per tablet per presa ordini rapida e gestione tavoli', en: 'Tablet-optimized interface for quick order taking and table management' },
  'landing.kds_desc': { it: 'Gestione ordini in tempo reale per il personale di cucina con timer e tracciamento stato', en: 'Real-time order management for kitchen staff with timer and status tracking' },
  'landing.customer_desc': { it: 'Mantieni i clienti informati con stato ordine e tempi di completamento stimati', en: 'Keep customers informed with order status and estimated completion times' },
  'landing.admin_desc': { it: 'Analisi complete e reporting per insight di business', en: 'Comprehensive analytics and reporting for business insights' },
  'landing.key_features': { it: 'Caratteristiche Principali', en: 'Key Features' },
  'landing.realtime_title': { it: 'Aggiornamenti in Tempo Reale', en: 'Real-time Updates' },
  'landing.realtime_desc': { it: 'Aggiornamenti live alimentati da WebSocket su tutti i dispositivi per coordinamento senza interruzioni', en: 'WebSocket-powered live updates across all devices for seamless coordination' },
  'landing.offline_title': { it: 'Supporto Offline', en: 'Offline Support' },
  'landing.offline_desc': { it: 'Continua le operazioni anche senza connessione internet con sincronizzazione automatica', en: 'Continue operations even without internet connection with automatic sync' },
  'landing.multirole_title': { it: 'Accesso Multi-ruolo', en: 'Multi-role Access' },
  'landing.multirole_desc': { it: 'Interfacce e permessi diversi per manager, camerieri e personale di cucina', en: 'Different interfaces and permissions for managers, waiters, and kitchen staff' },

  // Messages
  'msg.error_updating': { it: 'Errore nell\'aggiornamento dello stato dell\'ordine.', en: 'Failed to update order status.' },
  'msg.transfer_success': { it: 'L\'ordine è stato trasferito con successo al nuovo tavolo.', en: 'The order has been successfully transferred to the new table.' },
  'msg.transfer_failed': { it: 'Trasferimento ordine fallito. Riprova.', en: 'Failed to transfer the order. Please try again.' },
};

let currentLanguage: Language = 'it'; // Default to Italian

export function setLanguage(lang: Language) {
  currentLanguage = lang;
  localStorage.setItem('restaurant_language', lang);
}

export function getLanguage(): Language {
  const stored = localStorage.getItem('restaurant_language') as Language;
  if (stored && (stored === 'it' || stored === 'en')) {
    currentLanguage = stored;
  }
  return currentLanguage;
}

export function t(key: string, fallback?: string): string {
  const translation = translations[key];
  if (!translation) {
    console.warn(`Translation missing for key: ${key}`);
    return fallback || key;
  }
  return translation[currentLanguage] || translation.en || fallback || key;
}

export function useTranslation() {
  const [language, setCurrentLanguage] = useState<Language>(getLanguage());

  useEffect(() => {
    const stored = getLanguage();
    setCurrentLanguage(stored);
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    setCurrentLanguage(lang);
  };

  return {
    t,
    language,
    setLanguage: changeLanguage,
  };
}