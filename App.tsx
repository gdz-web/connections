import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Contact, RelatedPerson, SearchResult, ViewMode } from './types';
import * as GeminiService from './services/geminiService';
import NetworkGraph from './components/NetworkGraph';
import { 
  UserPlus, 
  Search, 
  Share2, 
  Briefcase, 
  MapPin, 
  Tag, 
  ExternalLink,
  Sparkles,
  X,
  Plus,
  ArrowRight,
  Save,
  Edit3,
  Trash2,
  GitMerge,
  CheckCircle,
  Circle,
  Upload,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  AlertTriangle
} from 'lucide-react';

// --- MOCK DATA FOR INITIALIZATION ---
const INITIAL_CONTACTS: Contact[] = [
  {
    id: '1',
    name: '李明',
    title: '高级产品经理',
    company: '字节跳动',
    location: '北京',
    tags: ['Product', 'AI', 'Mobile'],
    summary: '资深产品专家，专注于移动端应用与AI落地。',
    notes: '在2023年科技峰会遇到。',
    relatedPeople: [{ name: '王强', relationship: 'Colleague' }],
  },
  {
    id: '2',
    name: '王强',
    title: '技术总监',
    company: '字节跳动',
    location: '北京',
    tags: ['Engineering', 'Cloud', 'Backend'],
    summary: '负责基础架构团队，拥有十年后端开发经验。',
    notes: '',
    relatedPeople: [{ name: '李明', relationship: 'Colleague' }],
  },
  {
    id: '3',
    name: '张伟',
    title: '投资人',
    company: '红杉资本',
    location: '上海',
    tags: ['VC', 'Finance', 'Tech'],
    summary: '关注硬科技领域的早期投资。',
    notes: '',
    relatedPeople: [],
  }
];

const App: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // Add Modal State
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewContact, setPreviewContact] = useState<Partial<Contact> | null>(null);

  // Enrichment State
  const [enrichMode, setEnrichMode] = useState<'WEB' | 'MANUAL'>('WEB');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{summary: string, sources: SearchResult[]} | null>(null);
  const [ignoredSourceUrls, setIgnoredSourceUrls] = useState<Set<string>>(new Set());
  
  // Manual Enrichment State
  const [manualText, setManualText] = useState('');
  const [manualImages, setManualImages] = useState<string[]>([]); // Base64 strings
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge Mode State
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [isMerging, setIsMerging] = useState(false);

  // Add Relationship Modal State
  const [showRelModal, setShowRelModal] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('');

  // Delete Confirmation State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // --- Derived Data ---
  
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const lowerQuery = searchQuery.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) || 
      c.company.toLowerCase().includes(lowerQuery) ||
      c.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }, [contacts, searchQuery]);

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  // --- Reset Enrichment State on Selection Change ---
  useEffect(() => {
    setSearchResults(null);
    setIgnoredSourceUrls(new Set());
    setManualText('');
    setManualImages([]);
    setEnrichMode('WEB');
  }, [selectedContactId]);

  // --- Actions ---

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    try {
      const result = await GeminiService.extractContactFromText(inputText);
      setPreviewContact(result);
    } catch (error) {
      alert("识别失败，请检查 URL 是否可访问或重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveContact = () => {
    if (previewContact && previewContact.name) {
      const newContact: Contact = {
        id: Date.now().toString(),
        name: previewContact.name || 'Unknown',
        title: previewContact.title || '',
        company: previewContact.company || '',
        email: previewContact.email,
        phone: previewContact.phone,
        location: previewContact.location,
        tags: previewContact.tags || [],
        summary: previewContact.summary || '',
        notes: '',
        relatedPeople: previewContact.relatedPeople || [],
        avatarUrl: `https://picsum.photos/200/200?random=${Date.now()}`
      };
      setContacts(prev => [...prev, newContact]);
      setShowAddModal(false);
      setInputText('');
      setPreviewContact(null);
      setSelectedContactId(newContact.id);
      setViewMode(ViewMode.LIST);
    }
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    
    // 1. Update list
    setContacts(prev => prev.filter(c => c.id !== deleteTargetId));
    
    // 2. If deleting the active contact, reset selection
    if (selectedContactId === deleteTargetId) {
      setSelectedContactId(null);
      setSearchResults(null);
    }

    setDeleteTargetId(null);
  };

  const handleSearchInfo = async () => {
    if (!selectedContact) return;
    setIsSearching(true);
    setSearchResults(null);
    setEnrichMode('WEB');
    setIgnoredSourceUrls(new Set());
    
    try {
      const result = await GeminiService.searchPersonInfo(selectedContact.name, selectedContact.company);
      setSearchResults(result);
    } catch (error) {
      alert("搜索失败，请检查网络或 Key");
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSourceIgnore = (url: string) => {
    setIgnoredSourceUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setManualImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setManualImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleEnrich = async () => {
    if (!selectedContact) return;
    setIsSearching(true); // Re-use loading state for processing
    
    try {
      // Prepare Payload based on active mode
      const payload: GeminiService.EnrichmentContext = {};

      if (enrichMode === 'WEB' && searchResults) {
        payload.webSummary = searchResults.summary;
        // Strict filtering: Only pass sources that are NOT ignored
        payload.validSources = searchResults.sources.filter(s => s.url && !ignoredSourceUrls.has(s.url));
      } else if (enrichMode === 'MANUAL') {
        payload.manualText = manualText;
        payload.manualImages = manualImages;
      }

      // 1. Enrich the current profile
      const enriched = await GeminiService.enrichContactProfile(selectedContact, payload);
      
      // 2. Automatically create new contacts for discovered related people/orgs
      const existingNames = new Set(contacts.map(c => c.name));
      existingNames.add(enriched.name);
      
      const newAutoContacts: Contact[] = [];
      
      enriched.relatedPeople.forEach(rel => {
        if (!existingNames.has(rel.name)) {
          const isOrg = rel.relationship.toLowerCase().includes('organization') || rel.relationship.toLowerCase().includes('company');
          newAutoContacts.push({
            id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: rel.name,
            title: isOrg ? '组织机构' : rel.relationship,
            company: isOrg ? rel.name : '',
            location: '',
            tags: ['AI发现', isOrg ? 'Organization' : 'Person'],
            summary: `系统根据 ${enriched.name} 的资料自动发现的人脉关联：${rel.relationship}`,
            notes: '',
            relatedPeople: [{ name: enriched.name, relationship: 'Origin Connection' }],
            avatarUrl: ''
          });
          existingNames.add(rel.name); 
        }
      });

      // 3. Update State
      setContacts(prev => {
        const updated = prev.map(c => c.id === enriched.id ? enriched : c);
        return [...updated, ...newAutoContacts];
      });
      
      // Reset enrichment UI
      setSearchResults(null); 
      setManualImages([]);
      setManualText('');
      
      if (newAutoContacts.length > 0) {
        alert(`资料已丰富！系统自动发现了 ${newAutoContacts.length} 个新的人脉节点并添加到了图谱中。`);
      } else {
        alert("资料已更新！");
      }
    } catch (error) {
      console.error(error);
      alert("更新失败");
    } finally {
      setIsSearching(false);
    }
  };

  const toggleMergeSelection = (id: string) => {
    setMergeSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmMerge = async () => {
    const selectedIds = Array.from(mergeSelection);
    if (selectedIds.length < 2) return;
    
    setIsMerging(true);
    try {
      const contactsToMerge = contacts.filter(c => selectedIds.includes(c.id));
      const mergedContact = await GeminiService.mergeContactsSmartly(contactsToMerge);

      setContacts(prev => {
        const others = prev.filter(c => !selectedIds.includes(c.id));
        return [mergedContact, ...others];
      });

      setIsMergeMode(false);
      setMergeSelection(new Set());
      setSelectedContactId(mergedContact.id);
      alert("合并成功！已生成统一的人物画像。");

    } catch (error) {
      console.error(error);
      alert("合并失败");
    } finally {
      setIsMerging(false);
    }
  };

  const handleAddRelation = () => {
    if (!selectedContact || !relTargetId || !relType.trim()) return;

    const targetContact = contacts.find(c => c.id === relTargetId);
    if (!targetContact) return;

    // Update both contacts to have a bidirectional link
    const newRelationForSource = { name: targetContact.name, relationship: relType };
    const newRelationForTarget = { name: selectedContact.name, relationship: relType }; // Simplified: Symmetric

    setContacts(prev => prev.map(c => {
      if (c.id === selectedContact.id) {
        // Prevent duplicates
        if (c.relatedPeople.some(p => p.name === targetContact.name)) return c;
        return { ...c, relatedPeople: [...c.relatedPeople, newRelationForSource] };
      }
      if (c.id === relTargetId) {
        if (c.relatedPeople.some(p => p.name === selectedContact.name)) return c;
        return { ...c, relatedPeople: [...c.relatedPeople, newRelationForTarget] };
      }
      return c;
    }));

    setShowRelModal(false);
    setRelTargetId('');
    setRelType('');
  };

  // --- Render Helpers ---

  const renderAddModal = () => {
    if (!showAddModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-indigo-500 w-5 h-5" />
              智能添加人脉
            </h2>
            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto">
            {!previewContact ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">粘贴文本信息 或 URL 链接 (自动提取网页内容)</label>
                <textarea 
                  className="w-full h-40 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-shadow"
                  placeholder="例如：这是王总，目前在腾讯担任高级工程师... &#10;或者直接粘贴链接：https://linkedin.com/in/xxx"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <div className="flex justify-end">
                   <button 
                    disabled={isProcessing || !inputText.trim()}
                    onClick={handleExtract}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-colors"
                  >
                    {isProcessing ? 'AI 分析中...' : '开始识别'}
                    {!isProcessing && <ArrowRight className="w-4 h-4" /> }
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                 <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                        <Edit3 className="w-4 h-4" /> 
                        AI 识别结果 (可点击修改)
                      </h3>
                      <span className="text-xs text-indigo-400">点击下划线区域修改信息</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="group">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">姓名</label>
                        <input 
                          type="text" 
                          value={previewContact.name || ''}
                          onChange={(e) => setPreviewContact({...previewContact, name: e.target.value})}
                          className="w-full bg-transparent border-b border-indigo-200 focus:border-indigo-600 outline-none py-1 text-slate-800 font-medium"
                        />
                      </div>
                      <div className="group">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">职位</label>
                        <input 
                          type="text" 
                          value={previewContact.title || ''}
                          onChange={(e) => setPreviewContact({...previewContact, title: e.target.value})}
                          className="w-full bg-transparent border-b border-indigo-200 focus:border-indigo-600 outline-none py-1 text-slate-800"
                        />
                      </div>
                      <div className="group col-span-2">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">公司/组织</label>
                        <input 
                          type="text" 
                          value={previewContact.company || ''}
                          onChange={(e) => setPreviewContact({...previewContact, company: e.target.value})}
                          className="w-full bg-transparent border-b border-indigo-200 focus:border-indigo-600 outline-none py-1 text-slate-800"
                        />
                      </div>
                      <div className="group col-span-2">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">位置</label>
                        <input 
                          type="text" 
                          value={previewContact.location || ''}
                          onChange={(e) => setPreviewContact({...previewContact, location: e.target.value})}
                          className="w-full bg-transparent border-b border-indigo-200 focus:border-indigo-600 outline-none py-1 text-slate-800"
                          placeholder="例如：北京"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">简介</label>
                        <textarea 
                          value={previewContact.summary || ''}
                          onChange={(e) => setPreviewContact({...previewContact, summary: e.target.value})}
                          className="w-full bg-white/50 border border-indigo-200 rounded p-2 focus:border-indigo-600 outline-none text-slate-700 text-sm h-24 resize-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-indigo-500 font-semibold mb-1">标签 (逗号分隔)</label>
                        <input 
                          type="text" 
                          value={previewContact.tags?.join(', ') || ''}
                          onChange={(e) => setPreviewContact({...previewContact, tags: e.target.value.split(/[,，]/).map(t => t.trim()).filter(Boolean)})}
                          className="w-full bg-transparent border-b border-indigo-200 focus:border-indigo-600 outline-none py-1 text-slate-800"
                        />
                      </div>
                    </div>
                 </div>
                 <div className="flex justify-end gap-3">
                   <button onClick={() => setPreviewContact(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">重试</button>
                   <button onClick={handleSaveContact} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 shadow-lg shadow-green-200">
                     <Save className="w-4 h-4" /> 确认保存
                   </button>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteConfirmModal = () => {
    if (!deleteTargetId) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all">
           <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <Trash2 className="w-6 h-6 text-red-600" />
           </div>
           <h3 className="text-lg font-bold text-center text-slate-800 mb-2">确认删除?</h3>
           <p className="text-center text-slate-500 text-sm mb-6">
             您确定要删除这位联系人吗？<br/>此操作无法撤销。
           </p>
           <div className="flex gap-3">
             <button 
               onClick={() => setDeleteTargetId(null)}
               className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
             >
               取消
             </button>
             <button 
               onClick={confirmDelete}
               className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
             >
               确认删除
             </button>
           </div>
        </div>
      </div>
    );
  };

  const renderRelationModal = () => {
    if (!showRelModal) return null;
    // Filter out currently selected contact
    const potentialTargets = contacts.filter(c => c.id !== selectedContactId);

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
           <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
             <LinkIcon className="w-5 h-5 text-indigo-600" />
             添加人脉关联
           </h3>
           
           <div className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">关联对象</label>
               <select 
                 className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                 value={relTargetId}
                 onChange={(e) => setRelTargetId(e.target.value)}
               >
                 <option value="">请选择...</option>
                 {potentialTargets.map(c => (
                   <option key={c.id} value={c.id}>{c.name} ({c.company || '未知公司'})</option>
                 ))}
               </select>
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">关系描述</label>
               <input 
                  type="text"
                  placeholder="例如：同事、前老板、合伙人"
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  value={relType}
                  onChange={(e) => setRelType(e.target.value)}
               />
             </div>
           </div>

           <div className="flex justify-end gap-3 mt-6">
             <button onClick={() => setShowRelModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">取消</button>
             <button 
               onClick={handleAddRelation}
               disabled={!relTargetId || !relType.trim()}
               className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
             >
               确认添加
             </button>
           </div>
        </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-slate-200 transition-all duration-300 flex flex-col shadow-sm z-10`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Share2 className="text-white w-5 h-5" />
          </div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight text-slate-800">Nexus</span>}
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4">
           {isSidebarOpen && (
            <div className="mb-4 px-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索人脉..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
          )}

          <button 
            onClick={() => { setViewMode(ViewMode.LIST); setSelectedContactId(null); setIsMergeMode(false); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${viewMode === ViewMode.LIST && !isMergeMode ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <UserPlus className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium">人脉列表</span>}
          </button>
          
          <button 
            onClick={() => setViewMode(ViewMode.GRAPH)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${viewMode === ViewMode.GRAPH ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Share2 className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium">关系图谱</span>}
          </button>

          <button 
            onClick={() => { setViewMode(ViewMode.LIST); setIsMergeMode(!isMergeMode); setSelectedContactId(null); setMergeSelection(new Set()); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${isMergeMode ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-100' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <GitMerge className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium">合并整理</span>}
          </button>
        </nav>

        {isMergeMode && isSidebarOpen ? (
          <div className="p-4 border-t border-purple-100 bg-purple-50">
            <button 
              onClick={handleConfirmMerge}
              disabled={mergeSelection.size < 2 || isMerging}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl p-3 flex items-center justify-center gap-2 transition-all shadow-md"
            >
              {isMerging ? (
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                 <GitMerge className="w-5 h-5" />
              )}
              <span className="font-bold">合并选中 ({mergeSelection.size})</span>
            </button>
          </div>
        ) : (
          <div className="p-4 border-t border-slate-100">
            <button 
              onClick={() => setShowAddModal(true)}
              className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-3 flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200`}
            >
              <Plus className="w-5 h-5" />
              {isSidebarOpen && <span className="font-bold">添加人脉</span>}
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {renderAddModal()}
        {renderRelationModal()}
        {renderDeleteConfirmModal()}

        {/* Header (Contextual) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            {viewMode === ViewMode.LIST ? (isMergeMode ? '选择需要合并的联系人' : '我的联系人') : '人际关系全景图'}
          </h1>
          
          {viewMode === ViewMode.GRAPH && (
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <Search className="w-4 h-4 text-slate-400" />
              <input 
                 type="text" 
                 placeholder="在图谱中搜索..."
                 className="bg-transparent border-none outline-none text-sm w-48"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          <div className="text-sm text-slate-500">
            共 {filteredContacts.length} 位联系人
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex">
          
          {/* VIEW: GRAPH */}
          {viewMode === ViewMode.GRAPH && (
            <div className="flex-1 h-full p-4 relative">
              <NetworkGraph 
                contacts={filteredContacts} 
                onNodeClick={(id) => {
                  setSelectedContactId(id);
                  setViewMode(ViewMode.LIST);
                }} 
              />
              <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur p-4 rounded-xl shadow border border-slate-100 max-w-xs text-xs text-slate-500 pointer-events-none">
                <h4 className="font-bold text-slate-800 mb-2">图谱说明</h4>
                <p>点击「智能丰富资料」可自动发现并链接相关人物，节点会自动添加到此图中。</p>
              </div>
            </div>
          )}

          {/* VIEW: LIST (Split Pane) */}
          {viewMode === ViewMode.LIST && (
            <>
              {/* Left Pane: List */}
              <div className="w-1/3 min-w-[320px] max-w-md border-r border-slate-200 bg-white overflow-y-auto h-full">
                {filteredContacts.length === 0 && (
                   <div className="p-8 text-center text-slate-400 text-sm">
                     未找到匹配的人脉
                   </div>
                )}
                {filteredContacts.map(contact => (
                  <div 
                    key={contact.id}
                    onClick={() => {
                      if (isMergeMode) toggleMergeSelection(contact.id);
                      else setSelectedContactId(contact.id);
                    }}
                    className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors relative group
                    ${selectedContactId === contact.id && !isMergeMode ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}
                    ${isMergeMode && mergeSelection.has(contact.id) ? 'bg-purple-50' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {isMergeMode && (
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${mergeSelection.has(contact.id) ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                          {mergeSelection.has(contact.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                      )}

                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${contact.tags.includes('AI发现') ? 'bg-orange-100 text-orange-600' : 'bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600'}`}>
                        {contact.name.charAt(0)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                           <h3 className="font-bold text-slate-900 truncate pr-6">{contact.name}</h3>
                           {contact.company && <span className="text-xs text-slate-400 truncate max-w-[80px] text-right">{contact.company}</span>}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{contact.title}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contact.tags.slice(0, 3).map(tag => (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded ${tag === 'AI发现' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-500'}`}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Pane: Detail */}
              <div className="flex-1 bg-slate-50 overflow-y-auto h-full p-8">
                {selectedContact ? (
                  <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                    {/* Header Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                       
                       <div className="flex items-start justify-between">
                         <div>
                            <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedContact.name}</h2>
                            <div className="flex items-center gap-4 text-slate-600 mb-4">
                              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {selectedContact.title}</span>
                              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {selectedContact.company}</span>
                              {selectedContact.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {selectedContact.location}</span>}
                            </div>
                         </div>
                         <button 
                           type="button"
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             setDeleteTargetId(selectedContact.id);
                           }}
                           className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                           title="删除联系人"
                         >
                           <Trash2 className="w-5 h-5" />
                         </button>
                       </div>
                       
                       <div className="flex flex-wrap gap-2 mt-2">
                          {selectedContact.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium flex items-center gap-1">
                              <Tag className="w-3 h-3" /> {tag}
                            </span>
                          ))}
                       </div>
                    </div>

                    {/* Enrichment Area */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="flex border-b border-slate-100">
                         <button 
                           onClick={() => setEnrichMode('WEB')}
                           className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${enrichMode === 'WEB' ? 'text-indigo-600 bg-indigo-50/50 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                         >
                            <Search className="w-4 h-4" /> 全网搜索丰富资料
                         </button>
                         <button 
                           onClick={() => setEnrichMode('MANUAL')}
                           className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${enrichMode === 'MANUAL' ? 'text-indigo-600 bg-indigo-50/50 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                         >
                            <Upload className="w-4 h-4" /> 手动录入 (简历/URL/图)
                         </button>
                       </div>

                       <div className="p-6">
                          {enrichMode === 'WEB' && (
                             <>
                                {!searchResults && !isSearching && (
                                  <div className="text-center py-6">
                                    <p className="text-slate-500 mb-4 text-sm">通过 Google 搜索获取最新职业动态、新闻报道及背景信息。</p>
                                    <button 
                                      onClick={handleSearchInfo}
                                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors"
                                    >
                                      开始全网搜索
                                    </button>
                                  </div>
                                )}

                                {isSearching && (
                                   <div className="flex flex-col gap-2 items-center justify-center py-8 text-indigo-600">
                                     <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                     <p className="text-sm">正在分析...</p>
                                   </div>
                                )}

                                {searchResults && !isSearching && (
                                  <div className="animate-fade-in">
                                     <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                        {searchResults.summary}
                                     </div>

                                     <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">选择可信来源 (取消勾选错误信息)</h4>
                                     <div className="flex flex-col gap-2 mb-6 max-h-48 overflow-y-auto pr-1">
                                        {searchResults.sources.map((source, idx) => {
                                          const isIgnored = source.url && ignoredSourceUrls.has(source.url);
                                          return (
                                            <div key={idx} className={`flex items-start gap-3 p-2 rounded border transition-all ${isIgnored ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-indigo-100 shadow-sm'}`}>
                                              <input 
                                                type="checkbox" 
                                                checked={!isIgnored}
                                                onChange={() => source.url && toggleSourceIgnore(source.url)}
                                                className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                              />
                                              <div className="flex-1 min-w-0">
                                                 <a href={source.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-900 hover:underline block truncate">
                                                   {source.title}
                                                 </a>
                                                 <span className="text-xs text-slate-500">{source.source}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                     </div>
                                     
                                     <div className="flex justify-end">
                                       <button 
                                         onClick={handleEnrich}
                                         className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-2"
                                       >
                                         <Sparkles className="w-4 h-4" />
                                         基于选中来源丰富资料
                                       </button>
                                     </div>
                                  </div>
                                )}
                             </>
                          )}

                          {enrichMode === 'MANUAL' && (
                             <div className="space-y-4 animate-fade-in">
                                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                   <input 
                                     type="file" 
                                     ref={fileInputRef} 
                                     className="hidden" 
                                     accept="image/*" 
                                     multiple 
                                     onChange={handleImageUpload}
                                   />
                                   <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                   <p className="text-sm font-medium text-slate-600">点击上传简历截图 / 名片 / 活动照</p>
                                   <p className="text-xs text-slate-400 mt-1">支持 JPG, PNG (AI将提取图片内容)</p>
                                </div>

                                {manualImages.length > 0 && (
                                  <div className="flex gap-2 overflow-x-auto pb-2">
                                    {manualImages.map((img, idx) => (
                                      <div key={idx} className="relative w-20 h-20 flex-shrink-0 border border-slate-200 rounded-lg overflow-hidden group">
                                         <img src={img} alt="upload" className="w-full h-full object-cover" />
                                         <button 
                                           onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                                           className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                                         >
                                           <X className="w-3 h-3" />
                                         </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div>
                                   <label className="block text-sm font-medium text-slate-700 mb-1">补充文本 或 URL 链接</label>
                                   <textarea 
                                     value={manualText}
                                     onChange={(e) => setManualText(e.target.value)}
                                     placeholder="在此输入：&#10;1. 个人主页 URL (例如：linkedin.com/in/xxx)&#10;2. 复制粘贴的简历文本&#10;3. 其他补充说明"
                                     className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                                   />
                                </div>

                                <div className="flex justify-end">
                                   <button 
                                      onClick={handleEnrich}
                                      disabled={manualImages.length === 0 && !manualText.trim()}
                                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold transition-all shadow-md shadow-green-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                   >
                                     <Sparkles className="w-4 h-4" />
                                     AI 分析并丰富档案
                                   </button>
                                </div>
                             </div>
                          )}
                       </div>
                    </div>

                    {/* Bio Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-lg font-bold text-slate-800 mb-4">个人简介</h3>
                      <p className="text-slate-600 leading-relaxed whitespace-pre-line">{selectedContact.summary}</p>
                    </div>

                     {/* Relationship Card */}
                     <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                         人脉网络
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedContact.relatedPeople.map((p, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors cursor-default">
                               <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                 {p.name.charAt(0)}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="font-medium text-slate-900 truncate">{p.name}</div>
                                 <div className="text-xs text-slate-500 truncate">{p.relationship}</div>
                               </div>
                            </div>
                          ))}
                          
                          {/* Add Relationship Button */}
                          <button 
                            onClick={() => setShowRelModal(true)}
                            className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-50 transition-colors cursor-pointer text-slate-500 hover:text-indigo-600 group"
                          >
                            <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:border-indigo-200 group-hover:bg-indigo-50">
                               <Plus className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">手动添加关联...</span>
                          </button>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                     <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                       {isMergeMode ? <GitMerge className="w-8 h-8 text-purple-300" /> : <UserPlus className="w-8 h-8 text-slate-300" />}
                     </div>
                     {isMergeMode ? (
                        <p className="text-purple-500 font-medium">请在左侧勾选 2 个或更多联系人进行合并</p>
                     ) : (
                        <p>选择左侧联系人查看详情</p>
                     )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;