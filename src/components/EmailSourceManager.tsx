import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Plus, Mail, Trash2, Edit, Check, X, Tag as TagIcon, User, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailSource, Tag } from '../types';
import TagManager from './TagManager';
import { useGlassToast } from './ui/glass-toast';

interface EmailSourceManagerProps {
  userId: string;
  onSourcesUpdated?: () => void;
}

export default function EmailSourceManager({ userId, onSourcesUpdated }: EmailSourceManagerProps) {
  const [sources, setSources] = useState<EmailSource[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newTagId, setNewTagId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [editingTagId, setEditingTagId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showTagManager, setShowTagManager] = useState(false);
  const { addToast } = useGlassToast();

  const notify = useCallback((options: { title?: string; description?: string; variant?: 'info' | 'success' | 'error' }) => {
    addToast({
      variant: 'info',
      durationMs: 4600,
      ...options
    });
  }, [addToast]);

  console.log('EmailSourceManager initialized with userId:', userId);

  useEffect(() => {
    fetchSources();
    fetchTags();
  }, [userId]);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('email_sources')
        .select(`
          *,
          tags (
            id,
            name,
            type,
            color,
            emoji
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Map database fields to TypeScript interface
      const mappedSources = (data || []).map((source: any) => ({
        id: source.id,
        userId: source.user_id,
        email: source.email,
        domain: source.domain,
        isActive: source.is_active,
        tagId: source.tag_id,
        tag: source.tags ? {
          id: source.tags.id,
          userId: userId,
          name: source.tags.name,
          type: source.tags.type,
          color: source.tags.color,
          emoji: source.tags.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        } : undefined,
        createdAt: new Date(source.created_at)
      }));

      setSources(mappedSources);
    } catch (error) {
      console.error('Error fetching sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

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
    }
  };

  const addSource = async () => {
    if (!newEmail.trim()) return;

    console.log('Adding source:', newEmail.trim(), 'for user:', userId);
    
    try {
      const emailDomain = newEmail.includes('@') ? newEmail.split('@')[1] : null;
      
      console.log('Inserting email source:', {
        user_id: userId,
        email: newEmail.trim(),
        domain: emailDomain,
        is_active: true
      });
      
      const { data, error } = await supabase
        .from('email_sources')
        .insert({
          user_id: userId,
          email: newEmail.trim(),
          domain: emailDomain,
          is_active: true,
          tag_id: newTagId || null
        })
        .select(`
          *,
          tags (
            id,
            name,
            type,
            color,
            emoji
          )
        `)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Successfully added source:', data);
      
      // Map database fields to TypeScript interface
      const mappedSource = {
        id: data.id,
        userId: data.user_id,
        email: data.email,
        domain: data.domain,
        isActive: data.is_active,
        tagId: data.tag_id,
        tag: data.tags ? {
          id: data.tags.id,
          userId: userId,
          name: data.tags.name,
          type: data.tags.type,
          color: data.tags.color,
          emoji: data.tags.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        } : undefined,
        createdAt: new Date(data.created_at)
      };
      
      setSources([mappedSource, ...sources]);
      setNewEmail('');
      setNewTagId('');
      setIsAdding(false);
      notify({ title: 'Email source added', description: newEmail.trim(), variant: 'success' });
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error adding source:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      notify({ title: 'Error adding source', description: errorMessage, variant: 'error' });
    }
  };

  const updateSource = async (id: string, email: string, tagId?: string) => {
    try {
      const emailDomain = email.includes('@') ? email.split('@')[1] : null;
      
      const { data, error } = await supabase
        .from('email_sources')
        .update({
          email: email.trim(),
          domain: emailDomain,
          tag_id: tagId || null
        })
        .eq('id', id)
        .select(`
          *,
          tags (
            id,
            name,
            type,
            color,
            emoji
          )
        `)
        .single();

      if (error) {
        throw error;
      }

      // Map database fields to TypeScript interface
      const mappedSource = {
        id: data.id,
        userId: data.user_id,
        email: data.email,
        domain: data.domain,
        isActive: data.is_active,
        tagId: data.tag_id,
        tag: data.tags ? {
          id: data.tags.id,
          userId: userId,
          name: data.tags.name,
          type: data.tags.type,
          color: data.tags.color,
          emoji: data.tags.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        } : undefined,
        createdAt: new Date(data.created_at)
      };

      setSources(sources.map(source => 
        source.id === id ? mappedSource : source
      ));
      notify({ title: 'Email source updated', description: mappedSource.email, variant: 'success' });
      setEditingId(null);
      setEditingEmail('');
      setEditingTagId('');
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error updating source:', error);
      notify({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'error' });
    }
  };

  const toggleSource = async (id: string, isActive: boolean) => {
    try {
      const { data, error } = await supabase
        .from('email_sources')
        .update({ is_active: !isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Map database fields to TypeScript interface
      const mappedSource = {
        id: data.id,
        userId: data.user_id,
        email: data.email,
        domain: data.domain,
        isActive: data.is_active,
        createdAt: new Date(data.created_at)
      };

      setSources(sources.map(source => 
        source.id === id ? mappedSource : source
      ));
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error toggling source:', error);
    }
  };

  const deleteSource = async (id: string) => {
    try {
      const { error } = await supabase
        .from('email_sources')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      setSources(sources.filter(source => source.id !== id));
      notify({ title: 'Email source deleted', variant: 'info' });
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error deleting source:', error);
      notify({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'error' });
    }
  };

  const startEditing = (source: EmailSource) => {
    setEditingId(source.id);
    setEditingEmail(source.email);
    setEditingTagId(source.tagId || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingEmail('');
    setEditingTagId('');
  };

  const handleTagsUpdated = () => {
    fetchTags();
    fetchSources();
    onSourcesUpdated?.();
  };

  const addSchoolEmailPresets = async () => {
    const presets = [
      '@district.edu',
      '@school.edu',
      'principal@',
      'teacher@',
      'admin@',
      'secretary@'
    ];

    for (const preset of presets) {
      await addPresetSource(preset);
    }
  };

  const addPresetSource = async (email: string) => {
    try {
      const emailDomain = email.includes('@') ? email.split('@')[1] : null;
      
      const { data, error } = await supabase
        .from('email_sources')
        .insert({
          user_id: userId,
          email: email,
          domain: emailDomain,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Map database fields to TypeScript interface
      const mappedSource = {
        id: data.id,
        userId: data.user_id,
        email: data.email,
        domain: data.domain,
        isActive: data.is_active,
        createdAt: new Date(data.created_at)
      };
      
      setSources(prev => [mappedSource, ...prev]);
    } catch (error) {
      console.error('Error adding preset source:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Loading email sources...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tag Manager */}
      {showTagManager && (
        <TagManager userId={userId} onTagsUpdated={handleTagsUpdated} />
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Sources
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTagManager(!showTagManager)}
            >
              <TagIcon className="h-4 w-4 mr-2" />
              {showTagManager ? 'Hide' : 'Manage'} Tags
            </Button>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure which email addresses or domains to monitor for school events and assign them to kids
          </p>
        </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add new source */}
          <div className="flex gap-2">
            {isAdding ? (
              <div className="space-y-3 w-full">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="teacher@school.edu or @school.edu"
                    className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <select
                    value={newTagId}
                    onChange={(e) => setNewTagId(e.target.value)}
                    className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
                  >
                    <option value="">No tag</option>
                    {tags.map(tag => (
                      <option key={tag.id} value={tag.id}>
                        {tag.emoji ? `${tag.emoji} ` : ''}{tag.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={addSource} size="sm">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => { setIsAdding(false); setNewTagId(''); }} variant="outline" size="sm">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setIsAdding(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Email Source
              </Button>
            )}
          </div>

          {/* Quick presets */}
          {sources.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-2">
                No email sources configured yet.
              </p>
              <Button onClick={addSchoolEmailPresets} variant="outline" size="sm">
                Add Common School Email Patterns
              </Button>
            </div>
          )}

          {/* Source list */}
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  source.isActive 
                    ? source.tag
                      ? 'border-l-4 bg-green-50 border-green-200' 
                      : 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
                style={source.tag && source.isActive ? { borderLeftColor: source.tag.color } : {}}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      source.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  
                  {editingId === source.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={editingEmail}
                        onChange={(e) => setEditingEmail(e.target.value)}
                        className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <select
                        value={editingTagId}
                        onChange={(e) => setEditingTagId(e.target.value)}
                        className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No tag</option>
                        {tags.map(tag => (
                          <option key={tag.id} value={tag.id}>
                            {tag.emoji ? `${tag.emoji} ` : ''}{tag.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{source.email}</p>
                        {source.domain && (
                          <p className="text-xs text-gray-500">Domain: {source.domain}</p>
                        )}
                      </div>
                      {source.tag && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" 
                             style={{ backgroundColor: `${source.tag.color}20`, color: source.tag.color }}>
                          {source.tag.type === 'kid' ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Globe className="h-3 w-3" />
                          )}
                          {source.tag.emoji && <span>{source.tag.emoji}</span>}
                          <span className="font-medium">{source.tag.name}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editingId === source.id ? (
                    <>
                      <Button
                        onClick={() => updateSource(source.id, editingEmail, editingTagId)}
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
                        onClick={() => toggleSource(source.id, source.isActive)}
                        size="sm"
                        variant="outline"
                      >
                        {source.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        onClick={() => startEditing(source)}
                        size="sm"
                        variant="outline"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => deleteSource(source.id)}
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

          {sources.length > 0 && (
            <div className="text-center pt-4 border-t">
              <p className="text-sm text-gray-600">
                {sources.filter(s => s.isActive).length} of {sources.length} sources active
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
} 
