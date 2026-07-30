/**
 * Server Component — BoardPage.js
 *
 * Loads all boards and passes them to the BoardView.
 */
import BoardView from "./BoardView";
import { loadAllBoards } from "../data/board.actions";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const boards = await loadAllBoards();

  return <BoardView boards={boards} initialBoardId={null} />;
}