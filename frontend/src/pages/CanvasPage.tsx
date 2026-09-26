import { useParams } from 'react-router-dom';

const CanvasPage = () => {
  const { projectId } = useParams();

  return (
    <div>
      <h1>Canvas for Project {projectId}</h1>
      {/* The Konva.js canvas will be rendered here */}
    </div>
  );
};

export default CanvasPage;
