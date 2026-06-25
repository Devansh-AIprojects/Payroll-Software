export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No data found', summaryRow }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === 'right' ? 'col-right' : ''}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              className={onRowClick ? 'clickable' : ''}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? 'col-right' : ''}
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {summaryRow && (
          <tfoot>
            <tr style={{ background: 'rgba(255,255,255,0.06)', fontWeight: 600, borderTop: '2px solid rgba(255,255,255,0.12)' }}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? 'col-right' : ''}
                >
                  {summaryRow[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
