import { useEffect, useState, useRef } from 'react';
import { batchesApi } from '../../api/batches';
import { documentsApi } from '../../api/documents';
import { formatBatchPurity } from '../../utils/formatters';

export function Documents() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState('');
  const fileInputRef = useRef(null);
  const [selectedBatch, setSelectedBatch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await batchesApi.list();
        setBatches(res?.data || res || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const handleUpload = async (batchId) => {
    setSelectedBatch(batchId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBatch) return;
    setUploading(selectedBatch);
    try {
      await documentsApi.uploadCoA(selectedBatch, file);
      const res = await batchesApi.list();
      setBatches(res?.data || res || []);
    } catch (err) {
      console.error(err);
    }
    setUploading('');
    e.target.value = '';
  };

  const items = Array.isArray(batches) ? batches : [];

  return (
    <div className="page-enter">
      <div className="page-header"><h2>Documents</h2></div>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept=".pdf,.jpg,.png" />
      {loading ? <div className="skeleton" style={{ height: '300px' }} /> : items.length === 0 ? (
        <div className="card empty-state"><h3>No batches</h3></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Batch ID</th><th>Quantity</th><th>Purity</th><th>Certificate</th><th>Action</th></tr></thead>
            <tbody>
              {items.map(b => (
                <tr key={b.id}>
                  <td className="text-mono" style={{ fontSize: 'var(--text-xs)' }}>{b.id.slice(0, 10)}...</td>
                  <td>{Number(b.capturedQuantity)} T</td>
                  <td>{formatBatchPurity(b)}</td>
                  <td>
                    {b.certificate ? (
                      <span className="badge badge-success">Uploaded</span>
                    ) : (
                      <span className="badge badge-neutral">Missing</span>
                    )}
                  </td>
                  <td>
                    {b.certificate ? (
                      <a href={documentsApi.downloadUrl(b.id)} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">Download</a>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleUpload(b.id)} disabled={uploading === b.id}>
                        {uploading === b.id ? 'Uploading...' : 'Upload CoA'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
