'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Star,
  Copy,
  ChevronLeft,
  Settings,
  Layers,
  Target,
  Gauge,
  Navigation,
  Check,
  Users
} from 'lucide-react';
import { ScenarioService } from '@/lib/zombie/scenario-service';
import { ScenarioPreset, SpawnRule, TriggerType } from '@/lib/zombie/types';

interface ZombieAdminProps {
  onClose: () => void;
}

type AdminScreen = 'presets' | 'rules' | 'edit_rule';

interface RuleFormData {
  name: string;
  trigger_type: TriggerType;
  turn_min: number;
  turn_max: number | null;
  isRange: boolean;
  zombie_count: number;
  distance_min: number;
  distance_max: number;
  speed: number;
  chance: number;
  use_player_avatars: boolean;
  avatar_chance: number;
}

const defaultRuleForm: RuleFormData = {
  name: '',
  trigger_type: 'turn',
  turn_min: 1,
  turn_max: null,
  isRange: false,
  zombie_count: 3,
  distance_min: 300,
  distance_max: 800,
  speed: 100,
  chance: 100,
  use_player_avatars: false,
  avatar_chance: 50,
};

export default function ZombieAdmin({ onClose }: ZombieAdminProps) {
  const [screen, setScreen] = useState<AdminScreen>('presets');
  const [presets, setPresets] = useState<ScenarioPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<ScenarioPreset | null>(null);
  const [rules, setRules] = useState<SpawnRule[]>([]);
  const [editingRule, setEditingRule] = useState<SpawnRule | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormData>(defaultRuleForm);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewPresetModal, setShowNewPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');

  // Загрузить пресеты
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    setIsLoading(true);
    const data = await ScenarioService.getPresets();
    setPresets(data);
    setIsLoading(false);
  };

  const loadRules = async (presetId: string) => {
    setIsLoading(true);
    const data = await ScenarioService.getRules(presetId);
    setRules(data);
    setIsLoading(false);
  };

  const handleSelectPreset = async (preset: ScenarioPreset) => {
    setSelectedPreset(preset);
    await loadRules(preset.id);
    setScreen('rules');
  };

  const handleCreatePreset = async () => {
    if (!newPresetName.trim()) return;
    
    setIsLoading(true);
    const preset = await ScenarioService.createPreset(newPresetName, newPresetDescription);
    if (preset) {
      await loadPresets();
      setShowNewPresetModal(false);
      setNewPresetName('');
      setNewPresetDescription('');
    }
    setIsLoading(false);
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Удалить этот пресет?')) return;
    
    setIsLoading(true);
    await ScenarioService.deletePreset(id);
    await loadPresets();
    setIsLoading(false);
  };

  const handleSetDefault = async (id: string) => {
    setIsLoading(true);
    await ScenarioService.setDefaultPreset(id);
    await loadPresets();
    setIsLoading(false);
  };

  const handleDuplicatePreset = async (preset: ScenarioPreset) => {
    setIsLoading(true);
    await ScenarioService.duplicatePreset(preset.id, `${preset.name} (копия)`);
    await loadPresets();
    setIsLoading(false);
  };

  const handleAddRule = () => {
    setEditingRule(null);
    setRuleForm(defaultRuleForm);
    setScreen('edit_rule');
  };

  const handleEditRule = (rule: SpawnRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      trigger_type: rule.trigger_type,
      turn_min: rule.turn_min ?? 1,
      turn_max: rule.turn_max,
      isRange: rule.turn_max !== null && rule.turn_max !== rule.turn_min,
      zombie_count: rule.zombie_count,
      distance_min: rule.distance_min,
      distance_max: rule.distance_max,
      speed: rule.speed,
      chance: rule.chance,
      use_player_avatars: rule.use_player_avatars ?? false,
      avatar_chance: rule.avatar_chance ?? 50,
    });
    setScreen('edit_rule');
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Удалить это правило?')) return;
    
    setIsLoading(true);
    await ScenarioService.deleteRule(id);
    if (selectedPreset) {
      await loadRules(selectedPreset.id);
    }
    setIsLoading(false);
  };

  const handleSaveRule = async () => {
    if (!selectedPreset || !ruleForm.name.trim()) return;
    
    setIsLoading(true);
    
    const ruleData = {
      name: ruleForm.name,
      trigger_type: ruleForm.trigger_type,
      turn_min: ruleForm.turn_min,
      turn_max: ruleForm.isRange ? ruleForm.turn_max : null,
      zombie_count: ruleForm.zombie_count,
      distance_min: ruleForm.distance_min,
      distance_max: ruleForm.distance_max,
      speed: ruleForm.speed,
      chance: ruleForm.chance,
      sort_order: rules.length,
      use_player_avatars: ruleForm.use_player_avatars,
      avatar_chance: ruleForm.avatar_chance,
    };
    
    if (editingRule) {
      await ScenarioService.updateRule(editingRule.id, ruleData);
    } else {
      await ScenarioService.createRule(selectedPreset.id, ruleData);
    }
    
    await loadRules(selectedPreset.id);
    setScreen('rules');
    setIsLoading(false);
  };

  // Экран списка пресетов
  const renderPresetsScreen = () => (
    <>
      {/* Заголовок */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-400" />
          Сценарии
        </h2>
        <button
          onClick={onClose}
          className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Контент */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {presets.map(preset => (
          <motion.div
            key={preset.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-zinc-800/80 rounded-2xl p-4 border ${
              preset.is_default ? 'border-purple-500/50' : 'border-zinc-700/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1" onClick={() => handleSelectPreset(preset)}>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">{preset.name}</span>
                  {preset.is_default && (
                    <span className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      По умолчанию
                    </span>
                  )}
                </div>
                {preset.description && (
                  <p className="text-zinc-400 text-xs mt-1">{preset.description}</p>
                )}
              </div>
              
              <div className="flex gap-1">
                {!preset.is_default && (
                  <button
                    onClick={() => handleSetDefault(preset.id)}
                    className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-yellow-400"
                    title="Сделать по умолчанию"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDuplicatePreset(preset)}
                  className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-blue-400"
                  title="Дублировать"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {!preset.is_default && (
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-400"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <button
              onClick={() => handleSelectPreset(preset)}
              className="mt-3 w-full py-2 bg-zinc-700/50 rounded-xl text-zinc-300 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Layers className="w-4 h-4" />
              Редактировать правила
            </button>
          </motion.div>
        ))}
      </div>
      
      {/* Кнопка добавления */}
      <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-zinc-900">
        <button
          onClick={() => setShowNewPresetModal(true)}
          className="w-full py-3 bg-purple-600 rounded-xl font-bold text-white flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Создать пресет
        </button>
      </div>
      
      {/* Модал создания пресета */}
      <AnimatePresence>
        {showNewPresetModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => setShowNewPresetModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-white mb-4">Новый пресет</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-zinc-400 text-sm mb-1 block">Название</label>
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    placeholder="Хардкорное выживание"
                    className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500"
                  />
                </div>
                
                <div>
                  <label className="text-zinc-400 text-sm mb-1 block">Описание</label>
                  <input
                    type="text"
                    value={newPresetDescription}
                    onChange={e => setNewPresetDescription(e.target.value)}
                    placeholder="Описание сценария..."
                    className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowNewPresetModal(false)}
                  className="flex-1 py-3 bg-zinc-800 rounded-xl font-medium text-zinc-400"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreatePreset}
                  disabled={!newPresetName.trim() || isLoading}
                  className="flex-1 py-3 bg-purple-600 rounded-xl font-bold text-white disabled:opacity-50"
                >
                  Создать
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // Экран списка правил
  const renderRulesScreen = () => (
    <>
      {/* Заголовок */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-zinc-800">
        <button
          onClick={() => setScreen('presets')}
          className="flex items-center gap-2 text-zinc-400"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Назад</span>
        </button>
        <h2 className="text-lg font-bold text-white">{selectedPreset?.name}</h2>
        <div className="w-16" />
      </div>
      
      {/* Контент */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <Layers className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">Нет правил</p>
            <p className="text-zinc-600 text-sm">Добавьте первое правило спавна</p>
          </div>
        ) : (
          rules.map((rule, index) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-zinc-800/80 rounded-2xl p-4 border border-zinc-700/50"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-white font-bold">{rule.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-zinc-500 text-xs">
                      Ход: {rule.turn_min}{rule.turn_max && rule.turn_max !== rule.turn_min ? `–${rule.turn_max}` : '+'}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-green-400 text-xs font-medium">
                      {rule.chance}%
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditRule(rule)}
                    className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-blue-400"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-zinc-700/50 rounded-lg px-3 py-2 text-center">
                  <Target className="w-4 h-4 text-red-400 mx-auto mb-1" />
                  <span className="text-white text-sm font-bold">{rule.zombie_count}</span>
                  <span className="text-zinc-500 text-[10px] block">зомби</span>
                </div>
                <div className="bg-zinc-700/50 rounded-lg px-3 py-2 text-center">
                  <Navigation className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                  <span className="text-white text-sm font-bold">{rule.distance_min}–{rule.distance_max}</span>
                  <span className="text-zinc-500 text-[10px] block">метров</span>
                </div>
                <div className="bg-zinc-700/50 rounded-lg px-3 py-2 text-center">
                  <Gauge className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <span className="text-white text-sm font-bold">{rule.speed}</span>
                  <span className="text-zinc-500 text-[10px] block">скорость</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
      
      {/* Кнопка добавления */}
      <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-zinc-900">
        <button
          onClick={handleAddRule}
          className="w-full py-3 bg-green-600 rounded-xl font-bold text-white flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Добавить правило
        </button>
      </div>
    </>
  );

  // Экран редактирования правила
  const renderEditRuleScreen = () => (
    <>
      {/* Заголовок */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-zinc-800">
        <button
          onClick={() => setScreen('rules')}
          className="flex items-center gap-2 text-zinc-400"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Назад</span>
        </button>
        <h2 className="text-lg font-bold text-white">
          {editingRule ? 'Редактирование' : 'Новое правило'}
        </h2>
        <button
          onClick={handleSaveRule}
          disabled={!ruleForm.name.trim() || isLoading}
          className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white disabled:opacity-50"
        >
          <Check className="w-5 h-5" />
        </button>
      </div>
      
      {/* Форма - скроллящийся контент */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-5 pb-32">
          {/* Название */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Название правила</label>
            <input
              type="text"
              value={ruleForm.name}
              onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
              placeholder="Первый контакт"
              className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500"
            />
          </div>
          
          {/* Триггер */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Триггер</label>
            <div className="bg-zinc-800 rounded-xl px-4 py-3 text-white flex items-center justify-between">
              <span>Номер хода</span>
              <Check className="w-5 h-5 text-green-400" />
            </div>
          </div>
          
          {/* Номер хода */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Номер хода</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={ruleForm.turn_min}
                onChange={e => setRuleForm({ ...ruleForm, turn_min: parseInt(e.target.value) || 1 })}
                min={0}
                className="flex-1 bg-zinc-800 rounded-xl px-4 py-3 text-white text-center"
              />
              
              {ruleForm.isRange && (
                <>
                  <span className="text-zinc-500">—</span>
                  <input
                    type="number"
                    value={ruleForm.turn_max ?? ruleForm.turn_min}
                    onChange={e => setRuleForm({ ...ruleForm, turn_max: parseInt(e.target.value) || null })}
                    min={ruleForm.turn_min}
                    className="flex-1 bg-zinc-800 rounded-xl px-4 py-3 text-white text-center"
                  />
                </>
              )}
            </div>
            
            <button
              onClick={() => setRuleForm({ ...ruleForm, isRange: !ruleForm.isRange, turn_max: ruleForm.isRange ? null : ruleForm.turn_min + 10 })}
              className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium ${
                ruleForm.isRange ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {ruleForm.isRange ? 'Диапазон активен' : 'Включить диапазон'}
            </button>
          </div>
          
          {/* Количество зомби */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 flex items-center justify-between">
              <span>Количество зомби</span>
              <span className="text-white font-bold">{ruleForm.zombie_count}</span>
            </label>
            <input
              type="range"
              value={ruleForm.zombie_count}
              onChange={e => setRuleForm({ ...ruleForm, zombie_count: parseInt(e.target.value) })}
              min={1}
              max={30}
              className="w-full accent-red-500"
            />
            <div className="flex justify-between text-zinc-600 text-xs mt-1">
              <span>1</span>
              <span>30</span>
            </div>
          </div>
          
          {/* Дистанция */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Дистанция (метров)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-zinc-600 text-xs">Мин</span>
                <input
                  type="number"
                  value={ruleForm.distance_min}
                  onChange={e => setRuleForm({ ...ruleForm, distance_min: parseInt(e.target.value) || 100 })}
                  min={50}
                  max={2000}
                  step={50}
                  className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white text-center"
                />
              </div>
              <div className="flex-1">
                <span className="text-zinc-600 text-xs">Макс</span>
                <input
                  type="number"
                  value={ruleForm.distance_max}
                  onChange={e => setRuleForm({ ...ruleForm, distance_max: parseInt(e.target.value) || 500 })}
                  min={ruleForm.distance_min}
                  max={3000}
                  step={50}
                  className="w-full bg-zinc-800 rounded-xl px-4 py-3 text-white text-center"
                />
              </div>
            </div>
          </div>
          
          {/* Скорость */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 flex items-center justify-between">
              <span>Скорость зомби (м/5мин)</span>
              <span className="text-white font-bold">{ruleForm.speed}</span>
            </label>
            <input
              type="range"
              value={ruleForm.speed}
              onChange={e => setRuleForm({ ...ruleForm, speed: parseInt(e.target.value) })}
              min={50}
              max={300}
              step={10}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-zinc-600 text-xs mt-1">
              <span>50 (медленно)</span>
              <span>300 (быстро)</span>
            </div>
          </div>
          
            {/* Шанс срабатывания */}
            <div>
              <label className="text-zinc-400 text-sm mb-2 flex items-center justify-between">
                <span>Шанс срабатывания</span>
                <span className="text-white font-bold">{ruleForm.chance}%</span>
              </label>
              <input
                type="range"
                value={ruleForm.chance}
                onChange={e => setRuleForm({ ...ruleForm, chance: parseInt(e.target.value) })}
                min={0}
                max={100}
                step={5}
                className="w-full accent-green-500"
              />
              <div className="flex justify-between text-zinc-600 text-xs mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
            
            {/* Аватарки погибших игроков */}
            <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">Зомби-игроки</span>
                </div>
                <button
                  onClick={() => setRuleForm({ ...ruleForm, use_player_avatars: !ruleForm.use_player_avatars })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    ruleForm.use_player_avatars ? 'bg-purple-500' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    ruleForm.use_player_avatars ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              <p className="text-zinc-500 text-xs mb-3">
                Некоторые зомби будут иметь аватарки погибших игроков
              </p>
              
              {ruleForm.use_player_avatars && (
                <div>
                  <label className="text-zinc-400 text-sm mb-2 flex items-center justify-between">
                    <span>Шанс появления с аватаркой</span>
                    <span className="text-white font-bold">{ruleForm.avatar_chance}%</span>
                  </label>
                  <input
                    type="range"
                    value={ruleForm.avatar_chance}
                    onChange={e => setRuleForm({ ...ruleForm, avatar_chance: parseInt(e.target.value) })}
                    min={0}
                    max={100}
                    step={10}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-zinc-600 text-xs mt-1">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      
      {/* Кнопка сохранения - фиксированная внизу */}
      <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-zinc-900">
        <button
          onClick={handleSaveRule}
          disabled={!ruleForm.name.trim() || isLoading}
          className="w-full py-4 bg-green-600 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 text-lg"
        >
          <Save className="w-6 h-6" />
          {editingRule ? 'Сохранить изменения' : 'Создать правило'}
        </button>
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] bg-zinc-900"
    >
      {/* Фон */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-green-500/10 rounded-full blur-3xl" />
      </div>
      
      {/* Контент - главный flex контейнер */}
      <div className="relative h-full flex flex-col overflow-hidden">
        {screen === 'presets' && renderPresetsScreen()}
        {screen === 'rules' && renderRulesScreen()}
        {screen === 'edit_rule' && renderEditRuleScreen()}
      </div>
      
      {/* Загрузка */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[260]">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </motion.div>
  );
}
