import { Route, Routes } from 'react-router-dom';
import { FullScreenMessage, LinkButton } from './components/ui.jsx';
import Create from './pages/host/Create.jsx';
import HostGame from './pages/host/HostGame.jsx';
import Lobby from './pages/host/Lobby.jsx';
import Results from './pages/host/Results.jsx';
import Review from './pages/host/Review.jsx';
import Join from './pages/player/Join.jsx';
import PlayerGame from './pages/player/PlayerGame.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Join />} />
      <Route path="/join" element={<Join />} />
      <Route path="/play/:code" element={<PlayerGame />} />
      <Route path="/host" element={<Create />} />
      <Route path="/host/review" element={<Review />} />
      <Route path="/host/lobby/:code" element={<Lobby />} />
      <Route path="/host/game/:code" element={<HostGame />} />
      <Route path="/host/results/:id" element={<Results />} />
      <Route
        path="*"
        element={
          <FullScreenMessage
            title="Page not found"
            action={<LinkButton to="/">Go home</LinkButton>}
          >
            That link does not lead anywhere.
          </FullScreenMessage>
        }
      />
    </Routes>
  );
}
