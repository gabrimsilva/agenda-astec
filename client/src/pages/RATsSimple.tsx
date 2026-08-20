import { useEffect, useState } from "react";

export default function RATsSimple() {
  const [rats, setRats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('astec_token');
    
    fetch('/api/rats', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        setRats(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>RATs - Carregando...</h1>
        <p>Aguarde...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', color: 'red' }}>
        <h1>Erro ao carregar RATs</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Tentar Novamente</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>RATs ({rats.length})</h1>
      
      {rats.length === 0 ? (
        <p>Nenhuma RAT encontrada.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Número</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Cliente</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Data</th>
            </tr>
          </thead>
          <tbody>
            {rats.map((rat) => (
              <tr key={rat.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px' }}>{rat.reportNumber}</td>
                <td style={{ padding: '10px' }}>{rat.clientName}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: rat.status === 'completa' ? '#90EE90' : rat.status === 'pendente' ? '#FFD700' : '#FFA500',
                    color: '#000'
                  }}>
                    {rat.status}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>
                  {new Date(rat.createdAt).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
