import React, { useState } from 'react';
import { Search, Plus, Trash2, Image as ImageIcon, MoreVertical, Edit2, AlertCircle, Package } from 'lucide-react';
import { Product, ShopSettings } from '../types';
import { formatCurrency, generateId, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface InventoryProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  settings: ShopSettings;
}

export function Inventory({ products, setProducts, settings }: InventoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync local sub-views with browser history for Back Button support
  React.useEffect(() => {
    const handlePopState = () => {
      if (isAddingProduct) {
        setIsAddingProduct(false);
        setEditProduct(null);
      }
    };

    if (isAddingProduct) {
      window.history.pushState({ subview: true }, '');
      window.addEventListener('popstate', handlePopState);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAddingProduct]);

  const t = translations[settings.language as Language || 'en'];

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    category: 'Grocery',
    price: undefined,
    purchasePrice: undefined,
    stock: undefined,
    barcode: '',
    image: '',
    lowStockThreshold: undefined
  });

  const resetForm = () => {
    setNewProduct({
      name: '',
      category: 'Grocery',
      price: undefined,
      purchasePrice: undefined,
      stock: undefined,
      barcode: '',
      image: '',
      lowStockThreshold: 5
    });
    setEditProduct(null);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode.includes(searchQuery)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || newProduct.price === undefined) return;

    setIsProcessing(true);
    try {
      if (editProduct) {
        await FirestoreService.saveProduct({ ...editProduct, ...newProduct } as Product);
      } else {
        const product: Product = {
          id: generateId(),
          name: newProduct.name as string,
          category: newProduct.category || 'General',
          price: Number(newProduct.price),
          purchasePrice: Number(newProduct.purchasePrice),
          stock: Number(newProduct.stock),
          barcode: newProduct.barcode || generateId(),
          image: newProduct.image || '',
          lowStockThreshold: Number(newProduct.lowStockThreshold) || 5
        };
        await FirestoreService.saveProduct(product);
      }

      setIsAddingProduct(false);
      resetForm();

      // Success Feedback
      const alertDiv = document.createElement('div');
      alertDiv.className = 'fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-[20px] shadow-2xl z-[200] font-black uppercase tracking-widest animate-bounce text-sm';
      alertDiv.innerText = editProduct ? 'Stock Updated / Maal Update Ho Gaya!' : 'Product Added / Maal Jama Ho Gaya!';
      document.body.appendChild(alertDiv);
      setTimeout(() => alertDiv.remove(), 2500);
    } catch (error) {
      console.error(error);
      alert("Ghalti: Stock save nahi hua. Internet check karein.");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deletingProductId) return;
    setIsProcessing(true);
    try {
      await FirestoreService.deleteProduct(deletingProductId);
    } finally {
      setIsProcessing(false);
      setDeletingProductId(null);
    }
  };

  const startEdit = (product: Product) => {
    setEditProduct(product);
    setNewProduct(product);
    setIsAddingProduct(true);
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Aiming for 30-50KB: 800px width with 0.7 quality is a good sweet spot for JPEG
        const MAX_WIDTH = 800; 
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64Str); return; }
        ctx.drawImage(img, 0, 0, width, height);
        // 0.7 quality for JPEG usually results in ~40KB for 800px photos
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new window.FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string);
        setNewProduct(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        console.error("Image compression failed", err);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={t.search_product} 
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm dark:text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button 
          onClick={() => { resetForm(); setIsAddingProduct(true); }}
          className="bg-slate-900 text-white p-3 rounded-xl shadow-lg shadow-slate-100 active:scale-95 transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 gap-3">
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Package size={32} />
            </div>
            <h4 className="text-slate-900 font-bold">No products found</h4>
            <p className="text-slate-500 text-xs">Add your stock to start selling</p>
          </div>
        ) : (
          filteredProducts.map(product => {
            const profit = product.price - product.purchasePrice;
            const margin = product.price > 0 ? (profit / product.price) * 100 : 0;

            return (
              <div key={product.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between group shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center font-bold overflow-hidden border border-slate-100 dark:border-slate-700",
                    product.stock <= product.lowStockThreshold 
                      ? "bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400" 
                      : "bg-slate-50 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                  )}>
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      product.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{product.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">{product.category}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">PKR {product.purchasePrice} cost</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                       <span className={cn(
                         "text-[9px] font-black uppercase px-1 rounded",
                         profit > 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                       )}>
                         Profit: {formatCurrency(profit)}
                       </span>
                       <span className="text-[9px] font-black text-slate-400 uppercase">
                         Margin: {margin.toFixed(0)}%
                       </span>
                    </div>
                    {product.stock <= product.lowStockThreshold && (
                      <div className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                        <AlertCircle size={10} />
                        Low Stock / Maal Kam Hai
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-black text-slate-900 dark:text-white">{formatCurrency(product.price, settings.currency)}</p>
                    <p className={cn(
                      "text-[10px] font-bold uppercase",
                      product.stock <= product.lowStockThreshold ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      Stock: {product.stock}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                     <button 
                      onClick={() => startEdit(product)}
                      className="p-1 px-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    >
                      <Edit2 size={16} />
                    </button>
                     <button 
                      onClick={() => setDeletingProductId(product.id)}
                      className="p-1 px-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Product Modal */}
      <AnimatePresence>
        {isAddingProduct && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              className="bg-white dark:bg-slate-800 w-full max-w-md rounded-t-[32px] sm:rounded-3xl p-6 pb-24 sm:pb-6 overflow-y-auto max-h-[95vh] no-scrollbar"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black dark:text-white">{editProduct ? 'Edit Product' : 'New Product / Naya Maal'}</h3>
                <button 
                  onClick={() => {setIsAddingProduct(false); resetForm();}}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-500 p-2 rounded-full"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Product Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="Enter product name"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Category</label>
                    <select 
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                    >
                      <option>Grocery</option>
                      <option>Electronics</option>
                      <option>Milk/Dairy</option>
                      <option>Bakery</option>
                      <option>Cosmetics</option>
                      <option>Repairs</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Product Image</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="h-[46px] bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <input 
                          type="file" 
                          accept="image/*"
                          capture="environment"
                          className="hidden" 
                          onChange={handleFileChange}
                        />
                         <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[9px] uppercase tracking-widest">
                           <Plus size={14} className="text-emerald-500" />
                           Camera
                         </div>
                      </label>
                      <label className="h-[46px] bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={handleFileChange}
                        />
                         <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[9px] uppercase tracking-widest">
                           <ImageIcon size={14} className="text-blue-500" />
                           Gallery
                         </div>
                      </label>
                    </div>
                    {newProduct.image && (
                      <div className="mt-2 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-xl border border-emerald-100 dark:border-emerald-800">
                        <div className="flex items-center gap-3">
                          <img src={newProduct.image} alt="Preview" className="h-10 w-10 object-cover rounded-lg shadow-sm" referrerPolicy="no-referrer" />
                          <div>
                            <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase leading-none">Photo Selected</p>
                            <p className="text-[8px] font-bold text-emerald-600/60 dark:text-emerald-400/60 uppercase mt-1">Compressed & Optimized</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setNewProduct({...newProduct, image: ''})}
                          className="text-amber-500 p-2 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-full transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Daily Price (Sale)</label>
                    <input 
                      required
                      type="number" 
                      className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm font-black focus:outline-none"
                      placeholder="0"
                      value={newProduct.price ?? ''}
                      onChange={(e) => setNewProduct({...newProduct, price: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Buy Price (Cost)</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none"
                      placeholder="0"
                      value={newProduct.purchasePrice ?? ''}
                      onChange={(e) => setNewProduct({...newProduct, purchasePrice: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Stock Qty</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm font-bold text-emerald-600 focus:outline-none"
                      placeholder="0"
                      value={newProduct.stock ?? ''}
                      onChange={(e) => setNewProduct({...newProduct, stock: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Low Stock Alert at</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none"
                      placeholder="5"
                      value={newProduct.lowStockThreshold ?? ''}
                      onChange={(e) => setNewProduct({...newProduct, lowStockThreshold: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-12">
                  <button 
                    type="button"
                    onClick={() => {setIsAddingProduct(false); setEditProduct(null);}}
                    className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-2xl shadow-lg dark:shadow-none shadow-slate-100 active:scale-95 transition-transform"
                  >
                    {editProduct ? 'Update Stock' : 'Add to Stock'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!deletingProductId}
        isLoading={isProcessing}
        title="Delete Product?"
        message="Are you sure you want to remove this product? this cannot be undone."
        onConfirm={confirmDeleteProduct}
        onCancel={() => setDeletingProductId(null)}
      />
    </div>
  );
}

