//Script logs schedule
  const SUPABASE_URL = 'https://vzubmycafgnjtwnjfpop.supabase.co';
  const SUPABASE_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWJteWNhZmduanR3bmpmcG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzNDY2NTQsImV4cCI6MjA1OTkyMjY1NH0.fDzlvR0xT3Sm8BTlCnEbxC8WE8-H3ZBRxA9SeEViaeo'; // Truncated for brevity
  const TABLE_ORIGINAL = 'schedules_originalv2';
  const TABLE_MANUAL = 'schedules_manualv2';

  let originalData = [];
  let manualData = [];

  async function loadAllSchedules() {
    try {
      const [originalRes, manualRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/${TABLE_ORIGINAL}?select=*`, {
          headers: {
            'apikey': SUPABASE_API_KEY,
            'Authorization': `Bearer ${SUPABASE_API_KEY}`
          }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/${TABLE_MANUAL}?select=*`, {
          headers: {
            'apikey': SUPABASE_API_KEY,
            'Authorization': `Bearer ${SUPABASE_API_KEY}`
          }
        })
      ]);

      if (!originalRes.ok || !manualRes.ok) throw new Error("Failed to load schedule data.");

      originalData = (await originalRes.json()).map(item => ({ ...item, source: 'original' }));
      manualData = (await manualRes.json()).map(item => ({ ...item, source: 'manual' }));
      

  populateFilters([...originalData, ...manualData]);
  const combinedSorted = [...originalData, ...manualData].sort((a, b) => {
  const dateA = new Date(a.date || a.created_at || 0);
  const dateB = new Date(b.date || b.created_at || 0);

  const timeA = new Date(a.start_time || a.time || 0);
  const timeB = new Date(b.start_time || b.time || 0);

  return dateA - dateB || timeA - timeB;
});

renderSchedule(combinedSorted);

    } catch (err) {
      console.error("Error loading schedules:", err.message);
      document.getElementById("schedule-table").innerHTML = `<p class="text-red-600">Failed to load schedules.</p>`;
    }
  }

  function populateFilters(allSchedules) {
    const roomSet = new Set();
    const profSet = new Set();
    const timeSet = new Set();
    const dateSet = new Set();

    allSchedules.forEach(s => {
      if (s.room) roomSet.add(s.room);
      if (s.prof) profSet.add(s.prof);
      if (s.date) dateSet.add(s.date);
      if (s.start_time && s.end_time) {
        const time = `${new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(s.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        timeSet.add(time);
      } else if (s.time) {
        timeSet.add(s.time); // fallback for `time` field
      }
    });

    const roomSelect = document.getElementById("filter-room");
    const profSelect = document.getElementById("filter-professor");
    const timeSelect = document.getElementById("filter-time");
    const dateSelect = document.getElementById("filter-date");

    roomSet.forEach(room => roomSelect.innerHTML += `<option value="${room}">${room}</option>`);
    profSet.forEach(prof => profSelect.innerHTML += `<option value="${prof}">${prof}</option>`);
    timeSet.forEach(time => timeSelect.innerHTML += `<option value="${time}">${time}</option>`);
    dateSet.forEach(date => dateSelect.innerHTML += `<option value="${date}">${date}</option>`);

    [roomSelect, profSelect, timeSelect, dateSelect].forEach(select => {
      select.addEventListener("change", applyFilters);
    });
  }

  function applyFilters() {
    const selectedRoom = document.getElementById("filter-room").value;
    const selectedProf = document.getElementById("filter-professor").value;
    const selectedTime = document.getElementById("filter-time").value;
    const selectedDate = document.getElementById("filter-date").value;

    const combined = [...originalData, ...manualData];

    const filtered = combined.filter(s => {
      const matchRoom = !selectedRoom || s.room === selectedRoom;
      const matchProf = !selectedProf || s.prof === selectedProf;
      const matchDate = !selectedDate || s.date === selectedDate;
      const scheduleTime = s.start_time && s.end_time
        ? `${new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(s.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
        : s.time || '';
      const matchTime = !selectedTime || scheduleTime === selectedTime;

      return matchRoom && matchProf && matchTime && matchDate;
    });
    document.getElementById("print-room-header").textContent =
  `Room: ${selectedRoom || 'ALL ROOMS'}`;


const filteredSorted = filtered.sort((a, b) => {
  const dateA = new Date(a.date || a.created_at || 0);
  const dateB = new Date(b.date || b.created_at || 0);

  const timeA = new Date(a.start_time || a.time || 0);
  const timeB = new Date(b.start_time || b.time || 0);

  return dateA - dateB || timeA - timeB;
});

renderSchedule(filteredSorted);

  }

function renderSchedule(schedules) {
  const container = document.getElementById("schedule-table");

  if (schedules.length === 0) {
    container.innerHTML = `
      <table class="min-w-full text-sm text-left border-collapse">
        <tr>
          <td colspan="7" class="px-4 py-2 text-center text-gray-500 border">No schedule found for this room.</td>
        </tr>
      </table>`;
    return;
  }

  const html = `
    <table class="min-w-full text-sm text-left border-collapse">
      <thead class="bg-orange-500 text-white">
        <tr>
          <th class="px-4 py-2 border">Date</th>
          <th class="px-4 py-2 border">Time</th> <!-- Time column for start_time and end_time -->
          <th class="px-4 py-2 border">Subject</th>
          <th class="px-4 py-2 border">Instructor</th>
          <th class="px-4 py-2 border">Section</th>
        </tr>
      </thead>
      <tbody>
        ${schedules.map(schedule => {
          const date = schedule.date ? new Date(schedule.date).toLocaleDateString() : '-';


let startTime = '-';
let endTime = '-';

if (schedule.start_time && schedule.end_time) {
  let start = new Date(schedule.start_time);
  let end = new Date(schedule.end_time);

  // Subtract 8 hours only for Room 315 AND if it's from manual schedule
  if (schedule.room === '315' && schedule.source === 'manual') {
    start.setHours(start.getHours() - 8);
    end.setHours(end.getHours() - 8);
  }

  startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

const time = startTime && endTime ? `${startTime} - ${endTime}` : '-';



          // Time In and Time Out will be null initially
          const timeIn = 'null'; // Placeholder for Time In (initially null)
          const timeOut = 'null'; // Placeholder for Time Out (initially null)

          return `
            <tr class="border-t">
              <td class="px-4 py-2 border">${date}</td>
              <td class="px-4 py-2 border">${time}</td> <!-- Time column -->

              <td class="px-4 py-2 border">${schedule.subject || '-'}</td>
              <td class="px-4 py-2 border">${schedule.prof || '-'}</td>
              <td class="px-4 py-2 border">${schedule.section || '-'}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}





  loadAllSchedules();