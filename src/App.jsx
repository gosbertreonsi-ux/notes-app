import { useState,useEffect } from "react";
import "./components/style.css";

function App(){

  const[title,setTitle] = useState("");
  const[content,setContent] = useState("");
  const[notes,setNotes] = useState([]);
  const [search,setSearch] = useState("");
  const [editingId,setEditingId] = useState(null);

  useEffect(()=>{
    const savedNotes = localStorage.getItem("notes");

    if(savedNotes){
      setNotes(JSON.parse(savedNotes));
    }
  },[]);

  useEffect(()=>{
    localStorage.setItem("notes",JSON.stringify(notes));
  },[notes]);

  const filteredNotes = notes.filter(note=>
    note.title.toLowerCase().includes(search.toLowerCase()) || note.content.toLowerCase().includes(search.toLowerCase())
  );  

  function startEdit(note){
    setEditingId(note.id);

    setTitle(note.title);
    setContent(note.content);
  }

  function addNote(){

    if(!title.trim() || !content.trim()){
      return;
    }

    if(editingId){

      setNotes(
        notes.map(note=>
          note.id === editingId
          ? {
            ...note,
            title,
            content
          }
          :note
        )
      );

      setEditingId(null);
      setTitle("");
      setContent("");
    } else {

    const newNote ={
      id:Date.now(),
      title,
      content
    };

    setNotes([...notes,newNote]);

    setTitle("");
    setContent("");
  }
  }
  function deleteNote(id){

    setNotes(
      notes.filter(note=> note.id !== id)
    );
  }

  return(
    <div className="container">
      <h1>Notes App</h1>

      <input 
       placeholder="Note title"
       type="text"
       value={title}
       onChange={(e)=>setTitle(e.target.value)}
        />

        <br /> <br />

        <textarea
        placeholder="Write your note..."
        value={content}
        onChange={(e)=>setContent(e.target.value)}
        />

        <br /> <br />

        <button onClick={addNote}>
          {editingId ? "Update Note" : "Add Note"
          }
        </button>

        <input
        type="text"
        placeholder="Search notes..."
        value={search}
        onChange={(e)=>setSearch(e.target.value)}
         />

        {
          filteredNotes.length === 0 ? (
            <p>No notes yet.Create your first note.</p>
          ) : (
          filteredNotes.map(note=>(
            <div className="note" key={Node.id}>

              <h3>{note.title}</h3>

              <p>{note.content}</p>

              <button
              onClick={()=>startEdit(note)}
              >
                Edit
              </button>

              <button
                onClick={()=>deleteNote(note.id)} >
                Delete
                </button>

            </div>
          ))
        )
        }

    </div>
  );
}

export default App;