// Сервис инвентаря игрока
import { supabase } from '../supabase-proxy';
import { InventoryItem, BOOKS, BookInfo, GAME_CONSTANTS } from './types';

export const InventoryService = {
  // Получить инвентарь игрока
  async getInventory(sessionId: string): Promise<InventoryItem[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId);
    
    if (error) {
      console.error('Error fetching inventory:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Добавить предмет в инвентарь
  async addItem(
    sessionId: string,
    item: { type: string; name: string; value: number; book_id?: string }
  ): Promise<InventoryItem | null> {
    if (!supabase) return null;
    
    // Для книг — каждая книга уникальна, не стакается
    if (item.type === 'book' && item.book_id) {
      // Проверить, есть ли уже эта книга
      const { data: existing } = await supabase
        .from('zombie_inventory')
        .select('*')
        .eq('session_id', sessionId)
        .eq('type', 'book')
        .eq('book_id', item.book_id)
        .single();
      
      if (existing) {
        // Книга уже есть, увеличить количество
        const { data, error } = await supabase
          .from('zombie_inventory')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating book:', error);
          return null;
        }
        return data;
      }
      
      // Создать новую книгу
      const { data, error } = await supabase
        .from('zombie_inventory')
        .insert({
          session_id: sessionId,
          type: 'book',
          name: item.name,
          quantity: 1,
          effect_value: item.value,
          book_id: item.book_id,
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error adding book:', error);
        return null;
      }
      
      return data;
    }
    
    // Проверить, есть ли такой предмет уже (для не-книг)
    const { data: existing } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', item.type)
      .eq('name', item.name)
      .single();
    
    if (existing) {
      // Увеличить количество
      const { data, error } = await supabase
        .from('zombie_inventory')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating inventory item:', error);
        return null;
      }
      
      return data;
    }
    
    // Создать новый предмет
    const { data, error } = await supabase
      .from('zombie_inventory')
      .insert({
        session_id: sessionId,
        type: item.type,
        name: item.name,
        quantity: 1,
        effect_value: item.value,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding inventory item:', error);
      return null;
    }
    
    return data;
  },
  
  // Использовать предмет
  async useItem(
    itemId: string
  ): Promise<{ success: boolean; effectValue?: number; type?: string; book_id?: string }> {
    if (!supabase) return { success: false };
    
    const { data: item, error } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('id', itemId)
      .single();
    
    if (error || !item || item.quantity <= 0) {
      return { success: false };
    }
    
    if (item.quantity === 1) {
      // Удалить предмет
      await supabase
        .from('zombie_inventory')
        .delete()
        .eq('id', itemId);
    } else {
      // Уменьшить количество
      await supabase
        .from('zombie_inventory')
        .update({ quantity: item.quantity - 1 })
        .eq('id', itemId);
    }
    
    return { 
      success: true, 
      effectValue: item.effect_value,
      type: item.type,
      book_id: item.book_id,
    };
  },
  
  // Использовать аптечку (хил)
  async useMedkit(sessionId: string): Promise<{ success: boolean; healAmount?: number }> {
    if (!supabase) return { success: false };
    
    // Найти аптечку в инвентаре
    const { data: medkit } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'medkit')
      .order('effect_value', { ascending: false })
      .limit(1)
      .single();
    
    if (!medkit) {
      return { success: false };
    }
    
    const result = await this.useItem(medkit.id);
    
    if (result.success) {
      return { success: true, healAmount: result.effectValue };
    }
    
    return { success: false };
  },
  
  // Очистить инвентарь сессии
  async clearInventory(sessionId: string): Promise<void> {
    if (!supabase) return;
    
    await supabase
      .from('zombie_inventory')
      .delete()
      .eq('session_id', sessionId);
  },
  
  // Получить количество аптечек
  async getMedkitCount(sessionId: string): Promise<number> {
    if (!supabase) return 0;
    
    const { data } = await supabase
      .from('zombie_inventory')
      .select('quantity')
      .eq('session_id', sessionId)
      .eq('type', 'medkit');
    
    if (!data) return 0;
    
    return data.reduce((sum, item) => sum + item.quantity, 0);
  },

  // Использовать фонарик
  async useFlashlight(sessionId: string): Promise<{ success: boolean; duration?: number }> {
    if (!supabase) return { success: false };
    
    // Найти фонарик в инвентаре
    const { data: flashlight } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'flashlight')
      .limit(1)
      .single();
    
    if (!flashlight) {
      return { success: false };
    }
    
    const result = await this.useItem(flashlight.id);
    
    if (result.success) {
      return { success: true, duration: result.effectValue || 30 };
    }
    
    return { success: false };
  },

  // Получить количество фонариков
  async getFlashlightCount(sessionId: string): Promise<number> {
    if (!supabase) return 0;
    
    const { data } = await supabase
      .from('zombie_inventory')
      .select('quantity')
      .eq('session_id', sessionId)
      .eq('type', 'flashlight');
    
    if (!data) return 0;
    
    return data.reduce((sum, item) => sum + item.quantity, 0);
  },

  // ===== СТАРТОВЫЙ НАБОР =====
  
  // Добавить стартовый набор предметов (аптечка, фонарик, книга)
  async addStarterKit(sessionId: string): Promise<{ success: boolean; items: string[] }> {
    const addedItems: string[] = [];
    
    // 1. Аптечка
    const medkit = await this.addItem(sessionId, {
      type: 'medkit',
      name: 'Аптечка',
      value: 25, // Восстанавливает 25 HP
    });
    if (medkit) addedItems.push('Аптечка');
    
    // 2. Фонарик
    const flashlight = await this.addItem(sessionId, {
      type: 'flashlight',
      name: 'Фонарик',
      value: GAME_CONSTANTS.FLASHLIGHT_DURATION_S, // 30 секунд
    });
    if (flashlight) addedItems.push('Фонарик');
    
    // 3. Книга "Война и мир"
    const warAndPeace = BOOKS.find(b => b.id === 'war_and_peace');
    if (warAndPeace) {
      const book = await this.addItem(sessionId, {
        type: 'book',
        name: `${warAndPeace.author} "${warAndPeace.title}"`,
        value: 1,
        book_id: warAndPeace.id,
      });
      if (book) addedItems.push(`"${warAndPeace.title}"`);
    }
    
    return { 
      success: addedItems.length > 0, 
      items: addedItems 
    };
  },

  // ===== КНИГИ =====
  
  // Добавить стартовую книгу "Война и мир" (legacy, используется addStarterKit)
  async addStarterBook(sessionId: string): Promise<InventoryItem | null> {
    const warAndPeace = BOOKS.find(b => b.id === 'war_and_peace');
    if (!warAndPeace) return null;
    
    return this.addItem(sessionId, {
      type: 'book',
      name: `${warAndPeace.author} "${warAndPeace.title}"`,
      value: 1, // effect_value для книги — урон по зомби
      book_id: warAndPeace.id,
    });
  },
  
  // Добавить случайную книгу
  async addRandomBook(sessionId: string): Promise<{ success: boolean; book?: BookInfo }> {
    // Выбрать случайную книгу
    const randomBook = BOOKS[Math.floor(Math.random() * BOOKS.length)];
    
    const item = await this.addItem(sessionId, {
      type: 'book',
      name: `${randomBook.author} "${randomBook.title}"`,
      value: 1,
      book_id: randomBook.id,
    });
    
    if (item) {
      return { success: true, book: randomBook };
    }
    
    return { success: false };
  },
  
  // Получить все книги в инвентаре
  async getBooks(sessionId: string): Promise<InventoryItem[]> {
    if (!supabase) return [];
    
    const { data } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'book');
    
    return data || [];
  },
  
  // Получить количество книг
  async getBookCount(sessionId: string): Promise<number> {
    if (!supabase) return 0;
    
    const { data } = await supabase
      .from('zombie_inventory')
      .select('quantity')
      .eq('session_id', sessionId)
      .eq('type', 'book');
    
    if (!data) return 0;
    
    return data.reduce((sum, item) => sum + item.quantity, 0);
  },
  
  // Использовать книгу (бросить в зомби)
  async useBook(sessionId: string): Promise<{ success: boolean; bookName?: string; bookId?: string }> {
    if (!supabase) return { success: false };
    
    // Найти любую книгу в инвентаре
    const { data: book } = await supabase
      .from('zombie_inventory')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'book')
      .limit(1)
      .single();
    
    if (!book) {
      return { success: false };
    }
    
    const result = await this.useItem(book.id);
    
    if (result.success) {
      return { success: true, bookName: book.name, bookId: book.book_id };
    }
    
    return { success: false };
  },
  
  // Получить информацию о книге по ID
  getBookInfo(bookId: string): BookInfo | undefined {
    return BOOKS.find(b => b.id === bookId);
  },
};
