import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Plus, Tag as TagIcon, Trash2, Edit, Check, X, User, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tag } from '../types';

interface TagManagerProps {
  userId: string;
  onTagsUpdated?: () => void;
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6B7280', // Gray
];

const DEFAULT_EMOJIS = ['👦', '👧', '🧒', '👶', '🎓', '📚', '⚽', '🎨', '🎵', '🏆'];

export default function TagManager({ userId, onTagsUpdated }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagType, setNewTagType] = useState<'kid' | 'general'>('kid');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);
  const [newTagEmoji, setNewTagEmoji] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [editingEmoji, setEditingEmoji] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags();
  }, [userId]);

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const mappedTags = (data || []).map((tag: any) => ({
        id: tag.id,
        userId: tag.user_id,
        name: tag.name,
        type: tag.type,
        color: tag.color,
        emoji: tag.emoji,
        createdAt: new Date(tag.created_at),
        updatedAt: new Date(tag.updated_at)
      }));

      setTags(mappedTags);
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({
          user_id: userId,
          name: newTagName.trim(),
          type: newTagType,
          color: newTagColor,
          emoji: newTagEmoji || null
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedTag = {
        id: data.id,
        userId: data.user_id,
        name: data.name,
        type: data.type,
        color: data.color,
        emoji: data.emoji,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      setTags([mappedTag, ...tags]);
      setNewTagName('');
      setNewTagType('kid');
      setNewTagColor(DEFAULT_COLORS[0]);
      setNewTagEmoji('');
      setIsAdding(false);
      onTagsUpdated?.();
    } catch (error) {
      console.error('Error adding tag:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Error adding tag: ' + errorMessage);
    }
  };

  const updateTag = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .update({
          name: editingName.trim(),
          color: editingColor,
          emoji: editingEmoji || null
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedTag = {
        id: data.id,
        userId: data.user_id,
        name: data.name,
        type: data.type,
        color: data.color,
        emoji: data.emoji,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      setTags(tags.map(tag => tag.id === id ? mappedTag : tag));
      setEditingId(null);
      setEditingName('');
      setEditingColor('');
      setEditingEmoji('');
      onTagsUpdated?.();
    } catch (error) {
      console.error('Error updating tag:', error);
    }
  };

  const deleteTag = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag? This will remove it from all email sources.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      setTags(tags.filter(tag => tag.id !== id));
      onTagsUpdated?.();
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  const startEditing = (tag: Tag) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
    setEditingEmoji(tag.emoji || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
    setEditingColor('');
    setEditingEmoji('');
  };

  const createDefaultTags = async () => {
    const defaultTags = [
      { name: 'General', type: 'general' as const, color: '#6B7280', emoji: '📧' },
      { name: 'Bobby', type: 'kid' as const, color: '#3B82F6', emoji: '👦' },
      { name: 'Sarah', type: 'kid' as const, color: '#EC4899', emoji: '👧' },
    ];

    for (const tag of defaultTags) {
      try {
        await supabase
          .from('tags')
          .insert({
            user_id: userId,
            name: tag.name,
            type: tag.type,
            color: tag.color,
            emoji: tag.emoji
          });
      } catch (error) {
        console.error('Error creating default tag:', error);
      }
    }

    fetchTags();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Loading tags...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagIcon className="h-5 w-5" />
          Tags
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Create tags for your kids and general categories to organize email sources
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add new tag */}
          <div className="space-y-3">
            {isAdding ? (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name (e.g., Bobby, Sarah, General)"
                    className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <select
                    value={newTagType}
                    onChange={(e) => setNewTagType(e.target.value as 'kid' | 'general')}
                    className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="kid">Kid</option>
                    <option value="general">General</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Color:</span>
                  <div className="flex gap-1">
                    {DEFAULT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewTagColor(color)}
                        className={`w-6 h-6 rounded-full border-2 ${
                          newTagColor === color ? 'border-gray-400' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Emoji:</span>
                  <input
                    type="text"
                    value={newTagEmoji}
                    onChange={(e) => setNewTagEmoji(e.target.value)}
                    placeholder="Optional emoji"
                    className="w-16 px-2 py-1 border rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={2}
                  />
                  <div className="flex gap-1">
                    {DEFAULT_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setNewTagEmoji(emoji)}
                        className="px-2 py-1 text-sm hover:bg-gray-100 rounded"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={addTag} size="sm">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => setIsAdding(false)} variant="outline" size="sm">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={() => setIsAdding(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Tag
              </Button>
            )}
          </div>

          {/* Quick setup for new users */}
          {tags.length === 0 && !isAdding && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-2">
                No tags created yet.
              </p>
              <Button onClick={createDefaultTags} variant="outline" size="sm">
                Create Default Tags
              </Button>
            </div>
          )}

          {/* Tag list */}
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 border rounded-lg"
                style={{ borderLeft: `4px solid ${tag.color}` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {tag.type === 'kid' ? (
                      <User className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Globe className="h-4 w-4 text-gray-600" />
                    )}
                    {tag.emoji && <span className="text-lg">{tag.emoji}</span>}
                  </div>
                  
                  {editingId === tag.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editingEmoji}
                        onChange={(e) => setEditingEmoji(e.target.value)}
                        placeholder="Emoji"
                        className="w-12 px-1 py-1 border rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        maxLength={2}
                      />
                      <div className="flex gap-1">
                        {DEFAULT_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => setEditingColor(color)}
                            className={`w-4 h-4 rounded-full border ${
                              editingColor === color ? 'border-gray-400' : 'border-gray-200'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium" style={{ color: tag.color }}>
                        {tag.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {tag.type}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editingId === tag.id ? (
                    <>
                      <Button
                        onClick={() => updateTag(tag.id)}
                        size="sm"
                        variant="outline"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={cancelEditing}
                        size="sm"
                        variant="outline"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => startEditing(tag)}
                        size="sm"
                        variant="outline"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => deleteTag(tag.id)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="text-center pt-4 border-t">
              <p className="text-sm text-gray-600">
                {tags.filter(t => t.type === 'kid').length} kid tags, {tags.filter(t => t.type === 'general').length} general tags
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
