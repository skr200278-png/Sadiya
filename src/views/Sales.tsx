import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, offlineSafeDocWrite, fastGetDocs } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ShoppingCart, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';

export default function Sales() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [records, setRecords] = useState<any[]>([]);
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);
  
  const [showForm, setShowForm] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleType, setSaleType] = useState('weight'); // 'weight' or 'quantity'
  const [totalWeightKg, setTotalWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerPiece, setPricePerPiece] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  const [batchCosts, setBatchCosts] = useState<{
    costPerChick: number;
    totalChicks: number;
    liveBirds: number;
    grandTotalCost: number;
    costPerBird: number;
    farmType: string;
  } | null>(null);

  useEffect(() => {
    if (!currentUser || !batchId) {
      setBatchCosts(null);
      return;
    }

    const fetchBatchSummaryCosts = async () => {
      try {
        const batch = activeBatches.find(b => b.id === batchId);
        if (!batch) return;

        const originalChicksCost = (Number(batch.totalChicks) || 0) * (Number(batch.costPerChick) || 0);

        // Expenses
        const expQ = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid), where('batchId', '==', batchId));
        const expSnap = await fastGetDocs(expQ);
        let tExpenses = 0;
        expSnap.forEach(doc => tExpenses += (Number(doc.data().amount) || 0));

        // Feed Cost
        const feedQ = query(collection(db, 'feed_records'), where('userId', '==', currentUser.uid), where('batchId', '==', batchId));
        const feedSnap = await fastGetDocs(feedQ);
        let tFeed = 0;
        feedSnap.forEach(doc => tFeed += (Number(doc.data().cost) || 0));

        // Medicine Cost
        const medQ = query(collection(db, 'medicine_records'), where('userId', '==', currentUser.uid), where('batchId', '==', batchId));
        const medSnap = await fastGetDocs(medQ);
        let tMed = 0;
        medSnap.forEach(doc => tMed += (Number(doc.data().cost) || 0));

        // Mortality
        const mortQ = query(collection(db, 'mortality'), where('userId', '==', currentUser.uid), where('batchId', '==', batchId));
        const mortSnap = await fastGetDocs(mortQ);
        let tMort = 0;
        mortSnap.forEach(doc => tMort += (Number(doc.data().count) || 0));

        const liveBirds = Math.max(1, (Number(batch.totalChicks) || 0) - tMort);
        const grandTotalCost = originalChicksCost + tExpenses + tFeed + tMed;
        const costPerBird = grandTotalCost / liveBirds;

        setBatchCosts({
          costPerChick: Number(batch.costPerChick) || 0,
          totalChicks: Number(batch.totalChicks) || 0,
          liveBirds,
          grandTotalCost,
          costPerBird,
          farmType: batch.farmType || 'poultry'
        });
      } catch (error) {
        console.error("Error fetching batch costs for indicator:", error);
      }
    };

    fetchBatchSummaryCosts();
  }, [batchId, currentUser, activeBatches]);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    const batchesQuery = query(collection(db, 'batches'), where('userId', '==', currentUser.uid));
    const unsubscribeBatches = onSnapshot(batchesQuery, (snap) => {
      const batches: any[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setActiveBatches(batches);
      if(batches.length > 0 && !batchId) {
        setBatchId(batches[0].id);
        if (batches[0].farmType === 'cattle') {
          setSaleType('quantity');
        } else {
          setSaleType('weight');
        }
      }
    });

    const salesQuery = query(collection(db, 'sales'), where('userId', '==', currentUser.uid));
    const unsubscribeSales = onSnapshot(salesQuery, (snap) => {
      const fetchedRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setRecords(fetchedRecords.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
      setLoading(false);
    });

    return () => {
      unsubscribeBatches();
      unsubscribeSales();
    };
  }, [currentUser]);

  const fetchInitialData = async () => {
    // No-op: Data is now synced automatically by onSnapshot
  };

    const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const handleBatchChange = (selectedBatchId: string) => {
    setBatchId(selectedBatchId);
    const batch = activeBatches.find(b => b.id === selectedBatchId);
    if (batch) {
      if (batch.farmType === 'cattle') {
        setSaleType('quantity');
      } else {
        setSaleType('weight');
      }
    } else {
      setSaleType('weight');
    }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    const targetId = deleteId;
    setDeleteId(null);
    try {
      await offlineSafeDocWrite(deleteDoc(doc(db, 'sales', targetId)));
      toast.success(t('common.success'), { duration: 3000 });
      fetchInitialData();
    } catch (error) {
      toast.error(t('common.error'));
      handleFirestoreError(error, OperationType.DELETE, 'sales');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !batchId) return toast.error(t('feed.batchSelectionReq'));
    if (isSubmitting || submitLock.current) return;

    let totalAmountVal = 0;
    if (saleType === 'weight') {
      totalAmountVal = Number(totalWeightKg) * Number(pricePerKg);
    } else {
      totalAmountVal = Number(quantity) * Number(pricePerPiece);
    }

    const paidValRaw = amountPaid ? Number(amountPaid) : totalAmountVal;
    const paidVal = Math.min(paidValRaw, totalAmountVal);

    if (paidVal < totalAmountVal && !buyerName.trim()) {
      return toast.error(t('sales.missingReceiver'));
    }

    setIsSubmitting(true);
    submitLock.current = true;

    try {
      const normalizedBuyerName = buyerName.trim().replace(/\s+/g, ' ');
      const newRecord = {
        userId: currentUser.uid,
        batchId,
        date,
        saleType,
        totalWeightKg: saleType === 'weight' ? Number(totalWeightKg) : 0,
        pricePerKg: saleType === 'weight' ? Number(pricePerKg) : 0,
        quantity: saleType === 'weight' ? (quantity ? Number(quantity) : 0) : Number(quantity),
        pricePerPiece: saleType === 'quantity' ? Number(pricePerPiece) : 0,
        totalAmount: totalAmountVal,
        amountPaid: paidVal,
        buyerName: normalizedBuyerName,
        createdAt: new Date().toISOString()
      };

      await offlineSafeDocWrite(addDoc(collection(db, 'sales'), newRecord));

      if (paidVal < totalAmountVal) {
        const batchName = activeBatches.find(b => b.id === batchId)?.batchName || 'Unknown Batch';
        const dueRecord = {
          userId: currentUser.uid,
          personName: normalizedBuyerName,
          phone: buyerPhone,
          type: 'receivable',
          amount: totalAmountVal,
          totalPaid: paidVal,
          details: `${batchName}${t('sales.saleDetails')}`,
          recordDate: date,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await offlineSafeDocWrite(addDoc(collection(db, 'dues'), dueRecord));
      }

      toast.success(t('sales.addSuccess'));
      setShowForm(false);
      setTotalWeightKg('');
      setPricePerKg('');
      setQuantity('');
      setPricePerPiece('');
      setAmountPaid('');
      setBuyerName('');
      setBuyerPhone('');
      fetchInitialData();
    } catch (error) {
      toast.error(t('common.error'));
      handleFirestoreError(error, OperationType.CREATE, 'sales');
    } finally {
      setIsSubmitting(false);
      submitLock.current = false;
    }
  };

  if (loading) return <div>{t('common.loading')}</div>;

  const currentTotalAmount = saleType === 'weight' 
    ? (Number(totalWeightKg) * Number(pricePerKg)) || 0 
    : (Number(quantity) * Number(pricePerPiece)) || 0;
  const currentPaidRaw = amountPaid ? Number(amountPaid) : currentTotalAmount;
  const currentDue = Math.max(0, currentTotalAmount - currentPaidRaw);
  const currentReturnAmount = amountPaid ? Math.max(0, currentPaidRaw - currentTotalAmount) : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart className="text-teal-600" /> {t('sales.title')}
        </h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-teal-600 text-white p-2 rounded-lg hover:bg-teal-700"
        >
          <Plus size={20} />
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-xl shadow border border-teal-100 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('medicine.batchLabel')}</label>
            <select required value={batchId} onChange={(e) => handleBatchChange(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="">{t('feed.selectOption')}</option>
              {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batchName}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.saleTypeLabel')}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="weight" checked={saleType === 'weight'} onChange={(e) => setSaleType(e.target.value)} className="text-teal-600 focus:ring-teal-500" />
                <span className="text-sm">{t('sales.typeWeight')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="quantity" checked={saleType === 'quantity'} onChange={(e) => setSaleType(e.target.value)} className="text-teal-600 focus:ring-teal-500" />
                <span className="text-sm">{t('sales.typeQuantity')}</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('medicine.dateLabel')}</label>
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.buyerName')}</label>
              <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.buyerNamePlaceholder')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.buyerPhone')}</label>
              <input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.buyerPhonePlaceholder')} />
            </div>
            {saleType === 'weight' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.totalWeight')}</label>
                <input required type="number" step="0.01" value={totalWeightKg} onChange={(e) => setTotalWeightKg(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.weightPlaceholder')} />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.quantityCount')}</label>
                <input required type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.qtyPlaceholder')} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {saleType === 'weight' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.qtyOptional')}</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.qtySoldPlaceholder')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.pricePerKgLabel')}</label>
                  <input required type="number" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.pricePerKgPlaceholder')} />
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.pricePerPieceLabel')}</label>
                <input required type="number" value={pricePerPiece} onChange={(e) => setPricePerPiece(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={t('sales.pricePerPiecePlaceholder')} />
              </div>
            )}
          </div>
          
          <div className="bg-teal-50 p-3 rounded-lg flex justify-between items-center mt-2 border border-teal-100">
            <span className="font-semibold text-teal-800">{t('sales.totalMoney')}</span>
            <span className="font-bold text-teal-700 text-lg">৳ {currentTotalAmount}</span>
          </div>

          {/* Real-time Profit/Loss and Break-even Simulator */}
          {batchCosts && batchCosts.farmType === 'poultry' && (
            <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/60 space-y-2 mt-1.5 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  {language === 'bn' ? '📊 লাভ-ক্ষতি ক্যালকুলেটর (লাইভ)' : '📊 Profit/Loss Calculator (Live)'}
                </span>
                <span className="text-[10px] font-bold bg-white text-emerald-800 px-2 py-0.5 rounded border border-slate-100">
                  {language === 'bn' ? `১টি মুরগির গড় খরচ: ৳${Math.round(batchCosts.costPerBird)}` : `Avg Cost/Bird: ৳${Math.round(batchCosts.costPerBird)}`}
                </span>
              </div>
              
              {/* If they explicitly entered quantity, we have exact data! */}
              {(quantity && Number(quantity) > 0) ? (() => {
                const qVal = Number(quantity);
                const totalEstimatedCost = qVal * batchCosts.costPerBird;
                const estProfit = currentTotalAmount - totalEstimatedCost;
                const isProfit = estProfit >= 0;
                
                return (
                  <div className={`p-2.5 rounded-lg border flex flex-col gap-1 ${isProfit ? 'bg-emerald-50 border-emerald-250 text-emerald-950' : 'bg-red-50 border-red-250 text-red-950'}`}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">
                        {language === 'bn' ? `উৎপাদন খরচ (${qVal} পিস):` : `Production Cost (${qVal} Pcs):`}
                      </span>
                      <span className="font-mono font-bold">৳{Math.round(totalEstimatedCost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black">
                        {isProfit 
                          ? (language === 'bn' ? '🟢 আনুমানিক লাভ:' : '🟢 Estimated Profit:') 
                          : '🔴 আনুমানিক লোকসান/লস:'}
                      </span>
                      <span className={`text-base font-extrabold font-mono ${isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isProfit ? '+' : ''}৳{Math.round(estProfit)}
                      </span>
                    </div>
                    <p className={`text-[10px] font-medium leading-relaxed ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isProfit 
                        ? (language === 'bn' ? '🎉 চমৎকার! এই দামে বিক্রি করলে আপনি লাভবান হবেন।' : '🎉 Excellent! Selling at this price is profitable.') 
                        : (language === 'bn' ? '⚠️ সতর্কবার্তা: উৎপাদন খরচের চেয়ে বিক্রি মূল্য কম! লোকসান এড়াতে কয়েকদিন পর বেশি দামে বিক্রি করতে পারেন।' : '⚠️ Caution: Sale price is lower than production cost! Consider holding or raising price to avoid loss.')}
                    </p>
                  </div>
                );
              })() : (
                /* If they only entered weight, perform simulation for different average weights */
                (totalWeightKg && Number(totalWeightKg) > 0) ? (() => {
                  const wVal = Number(totalWeightKg);
                  
                  // Scenario A: 1.5kg avg weight
                  const estQtyA = wVal / 1.5;
                  const estCostA = estQtyA * batchCosts.costPerBird;
                  const profitA = currentTotalAmount - estCostA;
                  
                  // Scenario B: 1.8kg avg weight
                  const estQtyB = wVal / 1.8;
                  const estCostB = estQtyB * batchCosts.costPerBird;
                  const profitB = currentTotalAmount - estCostB;

                  return (
                    <div className="space-y-1.5 pt-0.5">
                      <p className="text-[10px] text-slate-500 font-bold leading-normal">
                        {language === 'bn' 
                          ? '* সঠিক হিসাবের জন্য উপরে "পাখির সংখ্যা (পিস)" দিন। নিচে গড় ওজন ভিত্তিক সম্ভাব্য লাভ-ক্ষতি প্রাক্কলন:' 
                          : '* For exact profit, enter "Pcs" above. Below is estimate based on avg weights:'}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Scenario A Card */}
                        <div className={`p-2 rounded-lg border ${profitA >= 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-red-50/70 border-red-200'}`}>
                          <p className="font-extrabold text-[10px] text-slate-700">
                            {language === 'bn' ? '১.৫ কেজি গড় হলে' : 'At 1.5kg Avg'}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {language === 'bn' ? `আনুমানিক: ${Math.round(estQtyA)}টি` : `Est: ${Math.round(estQtyA)} birds`}
                          </p>
                          <p className={`font-black mt-0.5 text-xs ${profitA >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {profitA >= 0 ? '+' : ''}৳{Math.round(profitA)}
                          </p>
                        </div>

                        {/* Scenario B Card */}
                        <div className={`p-2 rounded-lg border ${profitB >= 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-red-50/70 border-red-200'}`}>
                          <p className="font-extrabold text-[10px] text-slate-700">
                            {language === 'bn' ? '১.৮ কেজি গড় হলে' : 'At 1.8kg Avg'}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {language === 'bn' ? `আনুমানিক: ${Math.round(estQtyB)}টি` : `Est: ${Math.round(estQtyB)} birds`}
                          </p>
                          <p className={`font-black mt-0.5 text-xs ${profitB >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {profitB >= 0 ? '+' : ''}৳{Math.round(profitB)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-[10px] text-slate-500 py-1 font-medium italic text-center">
                    {language === 'bn' ? 'লাভ-ক্ষতির লাইভ হিসাব দেখতে উপরে ওজন বা পিস উল্লেখ করুন' : 'Specify weight or pcs above to see live profit/loss analysis'}
                  </p>
                )
              )}
            </div>
          )}

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.cashReceived')}</label>
             <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500" placeholder={`${t('sales.cashPlaceholder')}${currentTotalAmount}`} />
             {currentDue > 0 && <p className="text-red-500 text-sm mt-1 font-semibold">{t('feed.dueMsg')}{currentDue}{t('feed.dueMsgAuto')}</p>}
             {currentReturnAmount > 0 && <p className="text-green-600 text-sm mt-1 font-semibold">{t('sales.returnToBuyer')}{currentReturnAmount}</p>}
          </div>

          <button disabled={isSubmitting} type="submit" className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl mt-2 disabled:bg-gray-400">
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {records.map(record => {
          const batchName = activeBatches.find(b => b.id === record.batchId)?.batchName || 'Unknown Batch';
          const rPaid = record.amountPaid !== undefined ? record.amountPaid : record.totalAmount;
          const rDue = record.totalAmount - rPaid;
          return (
            <div key={record.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-800">{new Date(record.date).toLocaleDateString()}</h3>
                  <p className="text-xs text-gray-500">{t('sales.batchTxt')}{batchName} {record.buyerName ? `${t('sales.buyerTxt')}${record.buyerName}` : ''}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="font-bold text-teal-600 text-lg">৳ {record.totalAmount}</span>
                  {rDue > 0 && <span className="text-xs font-semibold text-red-500 outline outline-1 outline-red-200 px-1 rounded mt-1">{t('feed.dueLabel')}{rDue}</span>}
                  {rDue === 0 && <span className="text-xs font-semibold text-green-600 outline outline-1 outline-green-200 px-1 rounded mt-1">{t('feed.paidLabel')}</span>}
                  <button onClick={() => handleDelete(record.id)} className="text-red-500 hover:bg-red-50 p-1 rounded-md mt-1 inline-block">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded text-sm text-gray-600 flex justify-between items-center flex-wrap gap-2">
                {(!record.saleType || record.saleType === 'weight') ? (
                  <>
                    <span>{t('sales.weightTxt')}{record.totalWeightKg}{t('sales.kgTxt')}</span>
                    {record.quantity > 0 ? <span>{t('sales.qtyTxt')}{record.quantity}{t('sales.pcsTxt')}</span> : null}
                    <span>{t('sales.rateTxt')}{record.pricePerKg}{t('sales.perKgTxt')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('sales.qtyTxt')}{record.quantity}{t('sales.pcsTxt')}</span>
                    <span>{t('sales.pieceRateTxt')}{record.pricePerPiece}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    
      <ConfirmModal 
        isOpen={!!deleteId}
        title={t('common.confirmDelete')}
        message={t('common.confirmDeleteMsg')}
        onConfirm={executeDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
