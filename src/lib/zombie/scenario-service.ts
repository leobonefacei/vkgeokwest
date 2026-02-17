// Сервис управления сценариями и правилами спавна зомби
import { supabase } from '../supabase-proxy';
import { SpawnRule, ScenarioPreset, TriggerType } from './types';

export const ScenarioService = {
  // ==================== ПРЕСЕТЫ ====================
  
  // Получить все пресеты
  async getPresets(): Promise<ScenarioPreset[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_scenario_presets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching presets:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Получить пресет с правилами
  async getPreset(id: string): Promise<ScenarioPreset | null> {
    if (!supabase) return null;
    
    const { data: preset, error } = await supabase
      .from('zombie_scenario_presets')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !preset) return null;
    
    const rules = await this.getRules(id);
    return { ...preset, rules };
  },
  
  // Получить пресет по умолчанию
  async getDefaultPreset(): Promise<ScenarioPreset | null> {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('zombie_scenario_presets')
      .select('*')
      .eq('is_default', true)
      .single();
    
    if (error || !data) {
      // Если нет пресета по умолчанию, создаём стандартный
      return this.createDefaultPresets();
    }
    
    const rules = await this.getRules(data.id);
    return { ...data, rules };
  },
  
  // Создать пресет
  async createPreset(name: string, description?: string): Promise<ScenarioPreset | null> {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('zombie_scenario_presets')
      .insert({
        name,
        description: description || null,
        is_default: false,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating preset:', error);
      return null;
    }
    
    return data;
  },
  
  // Обновить пресет
  async updatePreset(id: string, data: Partial<ScenarioPreset>): Promise<boolean> {
    if (!supabase) return false;
    
    const { error } = await supabase
      .from('zombie_scenario_presets')
      .update({
        name: data.name,
        description: data.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating preset:', error);
      return false;
    }
    
    return true;
  },
  
  // Удалить пресет
  async deletePreset(id: string): Promise<boolean> {
    if (!supabase) return false;
    
    // Проверить, не является ли он единственным пресетом по умолчанию
    const preset = await this.getPreset(id);
    if (preset?.is_default) {
      console.error('Cannot delete default preset');
      return false;
    }
    
    const { error } = await supabase
      .from('zombie_scenario_presets')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting preset:', error);
      return false;
    }
    
    return true;
  },
  
  // Установить пресет по умолчанию
  async setDefaultPreset(id: string): Promise<boolean> {
    if (!supabase) return false;
    
    // Сначала убрать флаг со всех пресетов
    await supabase
      .from('zombie_scenario_presets')
      .update({ is_default: false })
      .neq('id', id);
    
    // Установить флаг на выбранный
    const { error } = await supabase
      .from('zombie_scenario_presets')
      .update({ is_default: true })
      .eq('id', id);
    
    if (error) {
      console.error('Error setting default preset:', error);
      return false;
    }
    
    return true;
  },
  
  // Дублировать пресет
  async duplicatePreset(id: string, newName: string): Promise<ScenarioPreset | null> {
    const original = await this.getPreset(id);
    if (!original) return null;
    
    // Создать копию пресета
    const newPreset = await this.createPreset(newName, original.description || undefined);
    if (!newPreset) return null;
    
    // Скопировать все правила
    if (original.rules) {
      for (const rule of original.rules) {
        await this.createRule(newPreset.id, {
          name: rule.name,
          trigger_type: rule.trigger_type,
          turn_min: rule.turn_min,
          turn_max: rule.turn_max,
          zombie_count: rule.zombie_count,
          distance_min: rule.distance_min,
          distance_max: rule.distance_max,
          speed: rule.speed,
          chance: rule.chance,
          sort_order: rule.sort_order,
        });
      }
    }
    
    return this.getPreset(newPreset.id);
  },
  
  // ==================== ПРАВИЛА ====================
  
  // Получить все правила пресета
  async getRules(presetId: string): Promise<SpawnRule[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_spawn_rules')
      .select('*')
      .eq('preset_id', presetId)
      .order('sort_order', { ascending: true });
    
    if (error) {
      console.error('Error fetching rules:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Создать правило
  async createRule(presetId: string, rule: Omit<SpawnRule, 'id' | 'preset_id' | 'created_at' | 'updated_at'>): Promise<SpawnRule | null> {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('zombie_spawn_rules')
      .insert({
        preset_id: presetId,
        name: rule.name,
        trigger_type: rule.trigger_type,
        turn_min: rule.turn_min,
        turn_max: rule.turn_max,
        zombie_count: rule.zombie_count,
        distance_min: rule.distance_min,
        distance_max: rule.distance_max,
        speed: rule.speed,
        chance: rule.chance,
        sort_order: rule.sort_order,
        use_player_avatars: rule.use_player_avatars ?? false,
        avatar_chance: rule.avatar_chance ?? 50,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating rule:', error);
      return null;
    }
    
    return data;
  },
  
  // Обновить правило
  async updateRule(id: string, data: Partial<SpawnRule>): Promise<boolean> {
    if (!supabase) return false;
    
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
    if (data.turn_min !== undefined) updateData.turn_min = data.turn_min;
    if (data.turn_max !== undefined) updateData.turn_max = data.turn_max;
    if (data.zombie_count !== undefined) updateData.zombie_count = data.zombie_count;
    if (data.distance_min !== undefined) updateData.distance_min = data.distance_min;
    if (data.distance_max !== undefined) updateData.distance_max = data.distance_max;
    if (data.speed !== undefined) updateData.speed = data.speed;
    if (data.chance !== undefined) updateData.chance = data.chance;
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
    if (data.use_player_avatars !== undefined) updateData.use_player_avatars = data.use_player_avatars;
    if (data.avatar_chance !== undefined) updateData.avatar_chance = data.avatar_chance;
    
    const { error } = await supabase
      .from('zombie_spawn_rules')
      .update(updateData)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating rule:', error);
      return false;
    }
    
    return true;
  },
  
  // Удалить правило
  async deleteRule(id: string): Promise<boolean> {
    if (!supabase) return false;
    
    const { error } = await supabase
      .from('zombie_spawn_rules')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting rule:', error);
      return false;
    }
    
    return true;
  },
  
  // Изменить порядок правил
  async reorderRules(presetId: string, ruleIds: string[]): Promise<boolean> {
    if (!supabase) return false;
    
    for (let i = 0; i < ruleIds.length; i++) {
      await supabase
        .from('zombie_spawn_rules')
        .update({ sort_order: i })
        .eq('id', ruleIds[i])
        .eq('preset_id', presetId);
    }
    
    return true;
  },
  
  // ==================== ИГРОВАЯ ЛОГИКА ====================
  
  // Оценить правила для текущего хода
  evaluateRulesForTurn(rules: SpawnRule[], turnNumber: number): SpawnRule[] {
    return rules.filter(rule => {
      if (rule.trigger_type !== 'turn') return false;
      
      // Проверяем попадание в диапазон хода
      const minTurn = rule.turn_min ?? 0;
      const maxTurn = rule.turn_max ?? rule.turn_min ?? Infinity;
      
      if (turnNumber < minTurn) return false;
      if (turnNumber > maxTurn) return false;
      
      // Проверяем шанс срабатывания
      if (rule.chance < 100) {
        const roll = Math.random() * 100;
        if (roll > rule.chance) return false;
      }
      
      return true;
    });
  },
  
  // ==================== ДЕФОЛТНЫЕ ПРЕСЕТЫ ====================
  
  // Создать стандартные пресеты при первом запуске
  async createDefaultPresets(): Promise<ScenarioPreset | null> {
    // Проверяем, есть ли уже пресеты
    const existing = await this.getPresets();
    if (existing.length > 0) {
      // Возвращаем первый как дефолтный
      await this.setDefaultPreset(existing[0].id);
      return this.getPreset(existing[0].id);
    }
    
    // Создаём "Стандартный" пресет
    const standardPreset = await this.createPreset('Стандартный', 'Сбалансированный режим для новичков');
    if (!standardPreset) return null;
    
    // Добавляем правила для стандартного пресета
    await this.createRule(standardPreset.id, {
      name: 'Начальная разведка',
      trigger_type: 'turn',
      turn_min: 1,
      turn_max: 5,
      zombie_count: 2,
      distance_min: 600,
      distance_max: 1200,
      speed: 80,
      chance: 40,
      sort_order: 0,
    });
    
    await this.createRule(standardPreset.id, {
      name: 'Первый контакт',
      trigger_type: 'turn',
      turn_min: 6,
      turn_max: 15,
      zombie_count: 3,
      distance_min: 400,
      distance_max: 800,
      speed: 100,
      chance: 60,
      sort_order: 1,
    });
    
    await this.createRule(standardPreset.id, {
      name: 'Нарастающая угроза',
      trigger_type: 'turn',
      turn_min: 16,
      turn_max: 30,
      zombie_count: 5,
      distance_min: 300,
      distance_max: 600,
      speed: 120,
      chance: 70,
      sort_order: 2,
    });
    
    await this.createRule(standardPreset.id, {
      name: 'Орда',
      trigger_type: 'turn',
      turn_min: 31,
      turn_max: null,
      zombie_count: 8,
      distance_min: 200,
      distance_max: 500,
      speed: 150,
      chance: 80,
      sort_order: 3,
    });
    
    // Устанавливаем как дефолтный
    await this.setDefaultPreset(standardPreset.id);
    
    // Создаём "Хардкор" пресет
    const hardcorePreset = await this.createPreset('Хардкорное выживание', 'Для опытных выживших - высокая сложность');
    if (hardcorePreset) {
      await this.createRule(hardcorePreset.id, {
        name: 'Раннее нашествие',
        trigger_type: 'turn',
        turn_min: 1,
        turn_max: 3,
        zombie_count: 5,
        distance_min: 300,
        distance_max: 600,
        speed: 120,
        chance: 100,
        sort_order: 0,
      });
      
      await this.createRule(hardcorePreset.id, {
        name: 'Волна',
        trigger_type: 'turn',
        turn_min: 4,
        turn_max: 15,
        zombie_count: 8,
        distance_min: 200,
        distance_max: 400,
        speed: 150,
        chance: 80,
        sort_order: 1,
      });
      
      await this.createRule(hardcorePreset.id, {
        name: 'Массовое вторжение',
        trigger_type: 'turn',
        turn_min: 16,
        turn_max: null,
        zombie_count: 15,
        distance_min: 100,
        distance_max: 300,
        speed: 200,
        chance: 100,
        sort_order: 2,
      });
    }
    
    // Создаём "Лёгкая прогулка" пресет
    const easyPreset = await this.createPreset('Лёгкая прогулка', 'Расслабленный режим для изучения местности');
    if (easyPreset) {
      await this.createRule(easyPreset.id, {
        name: 'Редкие встречи',
        trigger_type: 'turn',
        turn_min: 1,
        turn_max: 20,
        zombie_count: 1,
        distance_min: 800,
        distance_max: 1500,
        speed: 60,
        chance: 30,
        sort_order: 0,
      });
      
      await this.createRule(easyPreset.id, {
        name: 'Случайные бродяги',
        trigger_type: 'turn',
        turn_min: 21,
        turn_max: null,
        zombie_count: 2,
        distance_min: 600,
        distance_max: 1000,
        speed: 80,
        chance: 50,
        sort_order: 1,
      });
    }
    
    return this.getPreset(standardPreset.id);
  },
};
