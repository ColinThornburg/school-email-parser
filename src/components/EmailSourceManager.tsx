import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Plus, Mail, Trash2, Edit, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailSource } from '../types';

interface EmailSourceManagerProps {
  userId: string;
  onSourcesUpdated?: () => void;
}

export default function EmailSourceManager({ userId, onSourcesUpdated }: EmailSourceManagerProps) {
  const [sources, setSources] = useState<EmailSource[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSources();
  }, [userId]);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('email_sources')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setSources(data || []);
    } catch (error) {
      console.error('Error fetching sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const addSource = async () => {
    if (!newEmail.trim()) return;

    try {
      const emailDomain = newEmail.includes('@') ? newEmail.split('@')[1] : null;
      
      const { data, error } = await supabase
        .from('email_sources')
        .insert({
          user_id: userId,
          email: newEmail.trim(),
          domain: emailDomain,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      setSources([data, ...sources]);
      setNewEmail('');
      setIsAdding(false);
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error adding source:', error);
    }
  };

  const updateSource = async (id: string, email: string) => {
    try {
      const emailDomain = email.includes('@') ? email.split('@')[1] : null;
      
      const { data, error } = await supabase
        .from('email_sources')
        .update({
          email: email.trim(),
          domain: emailDomain
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setSources(sources.map(source => 
        source.id === id ? data : source
      ));
      setEditingId(null);
      setEditingEmail('');
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error updating source:', error);
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

      setSources(sources.map(source => 
        source.id === id ? data : source
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
      onSourcesUpdated?.();
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };

  const startEditing = (source: EmailSource) => {
    setEditingId(source.id);
    setEditingEmail(source.email);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingEmail('');
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

      setSources(prev => [data, ...prev]);
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Sources
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure which email addresses or domains to monitor for school events
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add new source */}
          <div className="flex gap-2">
            {isAdding ? (
              <>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="teacher@school.edu or @school.edu"
                  className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <Button onClick={addSource} size="sm">
                  <Check className="h-4 w-4" />
                </Button>
                <Button onClick={() => setIsAdding(false)} variant="outline" size="sm">
                  <X className="h-4 w-4" />
                </Button>
              </>
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
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      source.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  
                  {editingId === source.id ? (
                    <input
                      type="email"
                      value={editingEmail}
                      onChange={(e) => setEditingEmail(e.target.value)}
                      className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div>
                      <p className="font-medium">{source.email}</p>
                      {source.domain && (
                        <p className="text-xs text-gray-500">Domain: {source.domain}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editingId === source.id ? (
                    <>
                      <Button
                        onClick={() => updateSource(source.id, editingEmail)}
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
  );
} 