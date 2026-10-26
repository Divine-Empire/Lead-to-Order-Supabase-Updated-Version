"use client"
import { PlusIcon, TrashIcon } from "../../components/Icons"

const NotesSection = ({ quotationData, handleNoteChange, addNote, removeNote }) => {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-medium mb-4">Notes</h3>
      <div className="space-y-4">
        {quotationData.notes.map((note, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => handleNoteChange(index, e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-md"
              placeholder="Enter note"
            />
            {quotationData.notes.length > 1 && (
              <button type="button" onClick={() => removeNote(index)} className="text-destructive hover:text-destructive p-2">
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addNote}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 flex items-center"
        >
          <PlusIcon className="h-4 w-4 mr-1" /> Add Note
        </button>
      </div>
    </div>
  )
}

export default NotesSection
