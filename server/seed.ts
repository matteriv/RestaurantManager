import { db } from './db';
import { menuCategories, menuItems, tables } from '@shared/schema';

// Dati di default per categorie menu
const defaultCategories = [
  { name: 'Antipasti', description: 'Antipasti e stuzzichini', sortOrder: 1 },
  { name: 'Pizza', description: 'Pizza tradizionale italiana', sortOrder: 2 },
  { name: 'Pasta', description: 'Primi piatti di pasta', sortOrder: 3 },
  { name: 'Carne', description: 'Secondi piatti di carne', sortOrder: 4 },
  { name: 'Pesce', description: 'Secondi piatti di pesce', sortOrder: 5 },
  { name: 'Contorni', description: 'Contorni e verdure', sortOrder: 6 },
  { name: 'Dolci', description: 'Dolci e dessert', sortOrder: 7 },
  { name: 'Bevande', description: 'Bibite e bevande', sortOrder: 8 },
  { name: 'Caffetteria', description: 'Caffè e bevande calde', sortOrder: 9 },
  { name: 'Vino', description: 'Vini e alcolici', sortOrder: 10 },
];

// Dati di default per tavoli (20 tavoli)
const defaultTables = [
  { number: 1, seats: 2, xPosition: 0, yPosition: 0 },
  { number: 2, seats: 2, xPosition: 1, yPosition: 0 },
  { number: 3, seats: 4, xPosition: 2, yPosition: 0 },
  { number: 4, seats: 4, xPosition: 3, yPosition: 0 },
  { number: 5, seats: 6, xPosition: 4, yPosition: 0 },
  { number: 6, seats: 2, xPosition: 0, yPosition: 1 },
  { number: 7, seats: 2, xPosition: 1, yPosition: 1 },
  { number: 8, seats: 4, xPosition: 2, yPosition: 1 },
  { number: 9, seats: 4, xPosition: 3, yPosition: 1 },
  { number: 10, seats: 6, xPosition: 4, yPosition: 1 },
  { number: 11, seats: 2, xPosition: 0, yPosition: 2 },
  { number: 12, seats: 2, xPosition: 1, yPosition: 2 },
  { number: 13, seats: 4, xPosition: 2, yPosition: 2 },
  { number: 14, seats: 4, xPosition: 3, yPosition: 2 },
  { number: 15, seats: 8, xPosition: 4, yPosition: 2 },
  { number: 16, seats: 2, xPosition: 0, yPosition: 3 },
  { number: 17, seats: 4, xPosition: 1, yPosition: 3 },
  { number: 18, seats: 4, xPosition: 2, yPosition: 3 },
  { number: 19, seats: 6, xPosition: 3, yPosition: 3 },
  { number: 20, seats: 8, xPosition: 4, yPosition: 3 },
];

export async function seedDatabase() {
  try {
    console.log('🌱 Avvio seedging database...');

    // Controlla se ci sono già categorie
    const existingCategories = await db.select().from(menuCategories).limit(1);
    if (existingCategories.length === 0) {
      console.log('📂 Inserimento categorie menu...');
      const insertedCategories = await db.insert(menuCategories).values(defaultCategories).returning();
      
      // Inserimento menu items per ogni categoria
      console.log('🍽️ Inserimento piatti menu...');
      
      for (const category of insertedCategories) {
        let items: any[] = [];
        
        switch (category.name) {
          case 'Antipasti':
            items = [
              { name: 'Bruschetta Classica', description: 'Pane tostato con pomodoro, basilico e aglio', price: '8.00', prepTimeMinutes: 5, station: 'cucina' },
              { name: 'Antipasto Misto', description: 'Selezione di salumi e formaggi locali', price: '15.00', prepTimeMinutes: 8, station: 'cucina' },
              { name: 'Arancini Siciliani', description: 'Arancini di riso con ragù e mozzarella (3 pezzi)', price: '10.00', prepTimeMinutes: 10, station: 'friggitrice' },
              { name: 'Carpaccio di Manzo', description: 'Carpaccio con rucola, grana e limone', price: '14.00', prepTimeMinutes: 5, station: 'cucina' },
            ];
            break;
          case 'Pizza':
            items = [
              { name: 'Margherita', description: 'Pomodoro, mozzarella, basilico', price: '8.00', prepTimeMinutes: 12, station: 'pizza' },
              { name: 'Marinara', description: 'Pomodoro, aglio, origano, olio EVO', price: '6.50', prepTimeMinutes: 10, station: 'pizza' },
              { name: 'Prosciutto e Funghi', description: 'Pomodoro, mozzarella, prosciutto cotto, funghi', price: '11.00', prepTimeMinutes: 12, station: 'pizza' },
              { name: 'Quattro Stagioni', description: 'Pomodoro, mozzarella, prosciutto, funghi, carciofini, olive', price: '13.00', prepTimeMinutes: 15, station: 'pizza' },
              { name: 'Diavola', description: 'Pomodoro, mozzarella, salame piccante', price: '10.00', prepTimeMinutes: 12, station: 'pizza' },
              { name: 'Capricciosa', description: 'Pomodoro, mozzarella, prosciutto, funghi, carciofini, olive, uovo', price: '14.00', prepTimeMinutes: 15, station: 'pizza' },
            ];
            break;
          case 'Pasta':
            items = [
              { name: 'Spaghetti Carbonara', description: 'Spaghetti con uova, pecorino, guanciale e pepe nero', price: '12.00', prepTimeMinutes: 10, station: 'cucina' },
              { name: 'Penne all\'Arrabbiata', description: 'Penne con pomodoro, aglio, peperoncino', price: '9.00', prepTimeMinutes: 8, station: 'cucina' },
              { name: 'Risotto ai Porcini', description: 'Risotto cremoso ai funghi porcini', price: '15.00', prepTimeMinutes: 18, station: 'cucina' },
              { name: 'Lasagne della Casa', description: 'Lasagne al ragù di carne e besciamella', price: '13.00', prepTimeMinutes: 25, station: 'cucina' },
              { name: 'Gnocchi al Gorgonzola', description: 'Gnocchi di patate con crema di gorgonzola e noci', price: '11.00', prepTimeMinutes: 12, station: 'cucina' },
            ];
            break;
          case 'Carne':
            items = [
              { name: 'Bistecca alla Fiorentina', description: 'Bistecca di manzo alla griglia (400g)', price: '25.00', prepTimeMinutes: 15, station: 'griglia' },
              { name: 'Scaloppine al Limone', description: 'Scaloppine di vitello al limone', price: '18.00', prepTimeMinutes: 12, station: 'cucina' },
              { name: 'Pollo alla Griglia', description: 'Petto di pollo marinato e grigliato', price: '14.00', prepTimeMinutes: 20, station: 'griglia' },
              { name: 'Salsiccia e Friarielli', description: 'Salsiccia napoletana con friarielli saltati', price: '16.00', prepTimeMinutes: 15, station: 'cucina' },
            ];
            break;
          case 'Pesce':
            items = [
              { name: 'Branzino al Sale', description: 'Branzino intero al sale con contorno', price: '22.00', prepTimeMinutes: 30, station: 'cucina' },
              { name: 'Salmone alla Griglia', description: 'Filetto di salmone grigliato con verdure', price: '19.00', prepTimeMinutes: 15, station: 'griglia' },
              { name: 'Frittura di Paranza', description: 'Frittura mista di pesce fresco', price: '18.00', prepTimeMinutes: 12, station: 'friggitrice' },
              { name: 'Spaghetti alle Vongole', description: 'Spaghetti con vongole veraci, aglio e prezzemolo', price: '16.00', prepTimeMinutes: 12, station: 'cucina' },
            ];
            break;
          case 'Contorni':
            items = [
              { name: 'Insalata Mista', description: 'Insalata di stagione con pomodori e carote', price: '5.00', prepTimeMinutes: 3, station: 'cucina' },
              { name: 'Patate al Forno', description: 'Patate arrosto con rosmarino', price: '4.50', prepTimeMinutes: 25, station: 'cucina' },
              { name: 'Verdure Grigliate', description: 'Melanzane, zucchine, peperoni grigliati', price: '6.00', prepTimeMinutes: 10, station: 'griglia' },
              { name: 'Spinaci Saltati', description: 'Spinaci saltati in padella con aglio', price: '4.50', prepTimeMinutes: 5, station: 'cucina' },
            ];
            break;
          case 'Dolci':
            items = [
              { name: 'Tiramisù della Casa', description: 'Tiramisù tradizionale fatto in casa', price: '6.00', prepTimeMinutes: 2, station: 'dessert' },
              { name: 'Panna Cotta ai Frutti di Bosco', description: 'Panna cotta con coulis di frutti di bosco', price: '5.50', prepTimeMinutes: 2, station: 'dessert' },
              { name: 'Cannoli Siciliani', description: 'Cannoli con ricotta e gocce di cioccolato (2 pezzi)', price: '7.00', prepTimeMinutes: 3, station: 'dessert' },
              { name: 'Gelato Artigianale', description: 'Gelato artigianale, 3 gusti a scelta', price: '4.50', prepTimeMinutes: 2, station: 'dessert' },
            ];
            break;
          case 'Bevande':
            items = [
              { name: 'Acqua Naturale', description: 'Acqua naturale (75cl)', price: '2.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Acqua Frizzante', description: 'Acqua frizzante (75cl)', price: '2.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Coca Cola', description: 'Coca Cola (33cl)', price: '3.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Birra Media', description: 'Birra alla spina (40cl)', price: '4.50', prepTimeMinutes: 2, station: 'bar' },
              { name: 'Succo di Frutta', description: 'Succo di frutta assortito', price: '3.50', prepTimeMinutes: 1, station: 'bar' },
            ];
            break;
          case 'Caffetteria':
            items = [
              { name: 'Caffè Espresso', description: 'Caffè espresso italiano', price: '1.50', prepTimeMinutes: 2, station: 'bar' },
              { name: 'Cappuccino', description: 'Cappuccino cremoso', price: '2.50', prepTimeMinutes: 3, station: 'bar' },
              { name: 'Caffè Macchiato', description: 'Espresso macchiato con schiuma di latte', price: '1.80', prepTimeMinutes: 2, station: 'bar' },
              { name: 'Americano', description: 'Caffè americano', price: '2.00', prepTimeMinutes: 2, station: 'bar' },
              { name: 'Tè Caldo', description: 'Tè assortito', price: '2.50', prepTimeMinutes: 3, station: 'bar' },
            ];
            break;
          case 'Vino':
            items = [
              { name: 'Vino della Casa Rosso', description: 'Vino rosso della casa (75cl)', price: '12.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Vino della Casa Bianco', description: 'Vino bianco della casa (75cl)', price: '12.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Chianti Classico', description: 'Chianti Classico DOCG (75cl)', price: '25.00', prepTimeMinutes: 1, station: 'bar' },
              { name: 'Prosecco', description: 'Prosecco di Valdobbiadene DOCG (75cl)', price: '20.00', prepTimeMinutes: 1, station: 'bar' },
            ];
            break;
        }
        
        if (items.length > 0) {
          const menuItemsWithCategory = items.map(item => ({
            ...item,
            categoryId: category.id,
          }));
          await db.insert(menuItems).values(menuItemsWithCategory);
        }
      }
    }

    // Controlla se ci sono già tavoli
    const existingTables = await db.select().from(tables).limit(1);
    if (existingTables.length === 0) {
      console.log('🪑 Inserimento tavoli...');
      await db.insert(tables).values(defaultTables);
    }

    console.log('✅ Database seeding completato!');
  } catch (error) {
    console.error('❌ Errore durante il seeding:', error);
    throw error;
  }
}