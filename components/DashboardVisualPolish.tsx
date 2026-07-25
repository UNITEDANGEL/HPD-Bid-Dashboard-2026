export default function DashboardVisualPolish() {
  return (
    <style jsx global>{`
      @media (min-width: 1024px) {
        body .dark-dashboard-shell {
          grid-template-columns: 260px minmax(0, 1fr);
        }

        body .dashboard-main {
          max-width: 1560px;
          width: 100%;
          margin: 0 auto;
          padding: 30px clamp(24px, 3.2vw, 52px) 52px;
        }

        body .dashboard-header {
          min-height: 132px;
          align-items: center;
          padding: 22px 24px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 30px;
          background:
            radial-gradient(circle at 82% 20%, rgba(56, 189, 248, 0.22), transparent 28%),
            linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.72));
          box-shadow: 0 28px 95px rgba(0, 0, 0, 0.28);
        }

        body .dashboard-header h1 {
          font-size: clamp(46px, 4vw, 72px);
        }

        body .metric-grid {
          gap: 18px;
          margin: 18px 0;
        }

        body .metric-card {
          min-height: 184px;
          padding: 20px;
          border-radius: 30px;
          background:
            linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(8, 13, 28, 0.86)),
            radial-gradient(circle at 90% 0%, rgba(255, 255, 255, 0.14), transparent 35%);
        }

        body .metric-card > strong {
          margin-top: 14px;
          font-size: clamp(42px, 3.6vw, 58px);
        }

        body .dashboard-grid {
          grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.9fr);
          grid-auto-flow: dense;
          gap: 18px;
          align-items: stretch;
        }

        body .panel {
          border-radius: 30px;
          background:
            linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(6, 12, 27, 0.86)),
            radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.10), transparent 34%);
          box-shadow: 0 28px 100px rgba(0, 0, 0, 0.3);
        }

        body .panel-wide:first-child {
          min-height: 370px;
        }

        body .line-chart svg {
          height: 270px;
        }

        body .map-panel {
          min-height: 370px;
        }

        body .mini-map {
          min-height: 275px;
          background:
            linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(0deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            radial-gradient(circle at 34% 35%, rgba(56, 189, 248, 0.26), transparent 18%),
            radial-gradient(circle at 75% 72%, rgba(52, 211, 153, 0.22), transparent 20%),
            linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(3, 7, 18, 0.98));
          background-size: 28px 28px, 28px 28px, auto, auto, auto;
        }

        body .activity-panel {
          min-height: 370px;
        }

        body .table-panel {
          grid-column: 1 / -1;
          min-height: 360px;
        }

        body .bid-table {
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 22px;
          overflow: hidden;
          background: rgba(2, 6, 23, 0.28);
        }

        body .table-row {
          min-height: 58px;
          padding: 0 16px;
        }
      }

      @media (min-width: 1280px) {
        body .dark-sidebar {
          padding: 30px 22px;
        }

        body .dashboard-grid {
          grid-template-columns: minmax(0, 1.65fr) minmax(380px, 0.9fr);
        }
      }

      @media (max-width: 1023px) {
        body .dark-dashboard-shell {
          display: block;
        }

        body .dark-sidebar {
          position: relative;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        body .dark-sidebar nav {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        body .dashboard-header,
        body .header-actions {
          display: grid;
        }

        body .metric-grid,
        body .dashboard-grid {
          grid-template-columns: 1fr;
        }

        body .table-row {
          grid-template-columns: 0.8fr 1.5fr;
          gap: 8px;
        }

        body .table-row span:nth-child(3),
        body .table-row span:nth-child(4),
        body .table-row em,
        body .table-head {
          display: none;
        }
      }
    `}</style>
  );
}
