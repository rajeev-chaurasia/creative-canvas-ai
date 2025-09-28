import { useParams } from 'react-router-dom';
import CanvasEditor from '../components/CanvasEditor';

const CanvasPage = () => {
  const { uuid } = useParams<{ uuid: string }>();

  if (!uuid) {
    return <div>Project not found</div>;
  }

  return <CanvasEditor projectUuid={uuid} />;
};

export default CanvasPage;
