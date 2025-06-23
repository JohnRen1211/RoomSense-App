// Initialize Supabase client
// ======================
// SUPABASE CONFIGURATION
// ======================
const SUPABASE_URL = 'https://vzubmycafgnjtwnjfpop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWJteWNhZmduanR3bmpmcG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzNDY2NTQsImV4cCI6MjA1OTkyMjY1NH0.fDzlvR0xT3Sm8BTlCnEbxC8WE8-H3ZBRxA9SeEViaeo';
const SUPABASE_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWJteWNhZmduanR3bmpmcG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDM0NjY1NCwiZXhwIjoyMDU5OTIyNjU0fQ.c7xkLWthN-SHSjJjs22CDy45MvfEFGxH7A-JD4aOSxI';
const TABLE_NAME = 'schedules_manualv2';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================
// GLOBAL VARIABLES
// ======================
let refreshInterval;
let isModalOpen = false;
let manualOverrides = {};
let currentRoom = null;
let currentSchedule = null;

const REFRESH_INTERVAL = 60000; // 1 minute
const SENSOR_POLL_INTERVAL = 5000; // 5 seconds
const ROOM_UPDATE_INTERVAL = 1000; // 1 second

// ======================
// REFRESH CONTROL SYSTEM
// ======================
function startAutoRefresh() {
    stopAutoRefresh();
    refreshInterval = setInterval(() => {
        if (!isModalOpen) {
            console.log("Auto-refreshing page...");
            window.location.reload();
        }
    }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function handleModalStateChange() {
    const modal = document.getElementById("modal");
    isModalOpen = modal && !modal.classList.contains("hidden");
    isModalOpen ? stopAutoRefresh() : startAutoRefresh();
}

// ======================
// SENSOR DATA SYSTEM
// ======================
async function updateSensorData() {
    try {
        const [res1, res2] = await Promise.all([
            supabaseClient.from('comp_data').select('*').order('created_at', { ascending: false }).limit(1),
            supabaseClient.from('comp_data2').select('*').order('created_at', { ascending: false }).limit(1)
        ]);
        
        const combined = {
            temperature: Math.min(res1.data?.[0]?.temperature ?? 100, res2.data?.[0]?.temperature ?? 100),
            humidity: Math.max(res1.data?.[0]?.humidity ?? 0, res2.data?.[0]?.humidity ?? 0),
            light: Math.max(res1.data?.[0]?.light ?? 0, res2.data?.[0]?.light ?? 0),
            motion: (res1.data?.[0]?.motion === 1 || res2.data?.[0]?.motion === 1) ? 1 : 0,
            created_at: new Date(Math.max(
                new Date(res1.data?.[0]?.created_at || 0), 
                new Date(res2.data?.[0]?.created_at || 0)
            ))
        };

        updateSensorUI(combined);
        updateRoom315Status(combined);

    } catch (error) {
        console.error("Error updating sensor data:", error);
    }
}

function updateSensorUI(data) {
    const isOn = data.temperature < 33 || data.light > 50 || data.motion === 1;
    const overallStatus = document.getElementById("overall-status");
    
    if (overallStatus) {
        overallStatus.textContent = `Status: ${isOn ? 'ON' : 'OFF'}`;
        overallStatus.className = `text-2xl font-bold text-center ${isOn ? 'text-green-600' : 'text-red-600'}`;
    }

    document.getElementById("temperatureCombined").textContent = `Temperature: ${data.temperature.toFixed(1)} °C`;
    document.getElementById("humidity2").textContent = `Humidity: ${data.humidity.toFixed(1)} %`;
    document.getElementById("light2").textContent = `Light: ${data.light}`;
    document.getElementById("timestampsCombined").textContent = `Timestamp: ${data.created_at.toLocaleString()}`;

    document.getElementById("temperature-combined").textContent = `Aircon Status: ${data.temperature < 33 ? 'On' : 'Off'}`;
    document.getElementById("light-status-combined").textContent = `Light Status: ${data.light > 50 ? 'On' : 'Off'}`;
    document.getElementById("motion-combined-status").textContent = `Motion Status: ${data.motion === 1 ? 'Motion Detected' : 'No Motion'}`;

    updateStatusList(data);
}

function updateStatusList(data) {
    const listElement = document.getElementById('status-list');
    if (!listElement) return;

    listElement.innerHTML = '';
    const statusList = [
        `Temperature: ${data.temperature < 33 ? 'ON' : 'OFF'}`,
        `Light: ${data.light > 50 ? 'ON' : 'OFF'}`,
        `Motion: ${data.motion === 1 ? 'DETECTED' : 'NONE'}`
    ];
    
    statusList.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        li.className = line.includes('ON') || line.includes('DETECTED') ? 'text-green-600 font-semibold' : 'text-gray-500';
        listElement.appendChild(li);
    });
}

function updateRoom315Status(data) {
    if (currentRoom !== "315") return;
    
    const roomStatusElement = document.getElementById("room-status");
    if (!roomStatusElement) return;

    const isOn = data.temperature < 33 || data.light > 50 || data.motion === 1;
    
    if (isOn) {
        roomStatusElement.textContent = "OCCUPIED SENSOR READING";
        roomStatusElement.style.color = "red";
    } else {
        roomStatusElement.textContent = "AVAILABLE";
        roomStatusElement.style.color = "green";
    }
}

// ======================
// REAL-TIME SUBSCRIPTIONS
// ======================
function setupRealtimeSubscriptions() {
    const subscriptions = [
        supabaseClient.channel('manual-schedules')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'schedules_manualv2' 
            }, () => {
                if (currentRoom) updateRoomStatus(currentRoom);
                updateAllRoomButtons();
            }),
        
        supabaseClient.channel('original-schedules')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'schedules_originalv2' 
            }, () => {
                if (currentRoom) updateRoomStatus(currentRoom);
                updateAllRoomButtons();
            }),
        
        supabaseClient.channel('sensor-data-1')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'comp_data' 
            }, () => {
                updateSensorData();
                if (currentRoom === "315") updateRoomStatus("315");
            }),
        
        supabaseClient.channel('sensor-data-2')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'comp_data2' 
            }, () => {
                updateSensorData();
                if (currentRoom === "315") updateRoomStatus("315");
            })
    ];

    subscriptions.forEach(channel => channel.subscribe());

    const sensorPolling = setInterval(() => {
        updateSensorData();
        if (currentRoom === "315") updateRoomStatus("315");
    }, SENSOR_POLL_INTERVAL);

    return () => {
        subscriptions.forEach(channel => channel.unsubscribe());
        clearInterval(sensorPolling);
    };
}

// ======================
// ROOM MANAGEMENT SYSTEM
// ======================
async function updateRoomStatus(room, event) {
    currentRoom = room;
    const elements = getRoomStatusElements();
    resetRoomUI(elements);

    try {
        const [{ data: originalData }, { data: manualData }] = await Promise.all([
            supabaseClient.from('schedules_originalv2').select('*').eq('room', room).order('start_time', { ascending: true }),
            supabaseClient.from('schedules_manualv2').select('*').eq('room', room).order('start_time', { ascending: true })
        ]);

        renderScheduleTable(originalData, manualData);
        updateRoomAvailability(originalData, manualData, elements, room);

    } catch (error) {
        console.error('Error fetching schedules:', error);
        elements.roomStatusElement.textContent = 'Error loading schedule';
        elements.roomStatusElement.style.color = 'red';
    }
}

function getRoomStatusElements() {
    return {
        roomStatusElement: document.getElementById("room-status"),
        roomNoElement: document.getElementById("room-no"),
        roomTypeElement: document.getElementById("room-type-details"),
        roomScheduleElement: document.getElementById("room-schedule"),
        occupiedByElement: document.getElementById("occupied-by"),
        instructorElement: document.getElementById("instructor"),
        representativeElement: document.getElementById("representative-details"),
        scanIndicator: document.getElementById("scan-indicator"),
        scanLabel: document.getElementById("scan-label")
    };
}

function resetRoomUI(elements) {
    elements.roomStatusElement.textContent = 'LOADING...';
    elements.roomStatusElement.style.color = 'gray';
    resetScanIndicator(elements);
    
    document.querySelectorAll("button").forEach(btn => {
        btn.classList.remove("border-4", "border-black");
    });
}

function resetScanIndicator(elements) {
    elements.scanIndicator.className = 'w-3 h-3 rounded-full bg-gray-400 inline-block';
    elements.scanLabel.textContent = 'No scan';
}

function renderScheduleTable(originalData, manualData) {
    const scheduleContainer = document.getElementById("schedule-container");
    
    if (originalData.length === 0 && manualData.length === 0) {
        scheduleContainer.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-2 text-center text-gray-500">
                    No schedule found for this room.
                </td>
            </tr>`;
        return;
    }

    const originalSchedules = originalData.map((s, i) => ({ ...s, source: 'Original', _index: i }));
    const manualSchedules = manualData.map((s, i) => ({ ...s, source: 'Manual', _index: i }));
    const mergedSchedules = [...originalSchedules, ...manualSchedules];

    scheduleContainer.innerHTML = mergedSchedules.map(schedule => {
        const adjustTime = currentRoom === '315';
        const displayTime = getDisplayTime(schedule, adjustTime);
        const date = new Date(schedule.date).toLocaleDateString();

        return `
            <tr>
                <td class="px-4 py-2 border">${date}</td>
                <td class="px-4 py-2 border">${displayTime}</td>
                <td class="px-4 py-2 border">${schedule.subject}</td>
                <td class="px-4 py-2 border">${schedule.prof}</td>
                <td class="px-4 py-2 border">${schedule.section}</td>
                <td class="px-4 py-2 border text-center">
                    <div class="flex flex-col items-center gap-1">
                        <span class="px-2 py-1 rounded ${
                            schedule.source === 'Manual' 
                            ? 'bg-orange-100 text-orange-600' 
                            : 'bg-blue-100 text-blue-600'
                        }">
                            ${schedule.source}
                        </span>
                        ${
                            schedule.source === 'Manual'
                            ? `<button 
                                    class="text-red-600 hover:underline text-sm"
                                    onclick="deleteSchedule('${schedule.source}', ${schedule._index})"
                                    title="Delete schedule"
                                >
                                    Delete
                                </button>`
                            : ''
                        }
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function getDisplayTime(schedule, adjustFor315) {
    if (!schedule.start_time || !schedule.end_time) return 'TBD';
    
    const startDate = new Date(schedule.start_time);
    const endDate = new Date(schedule.end_time);
    const first = startDate < endDate ? startDate : endDate;
    const second = startDate < endDate ? endDate : startDate;

    const start = formatTimeTo12Hour(first, adjustFor315);
    const end = formatTimeTo12Hour(second, adjustFor315);

    return `${start} - ${end}`;
}

function updateRoomAvailability(originalData, manualData, elements, room) {
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const nowMs = localNow.getTime();
    const today = new Date(localNow);
    today.setHours(0, 0, 0, 0);

    const originalNow = filterActiveSchedules(originalData, room, nowMs);
    const manualNow = filterActiveSchedules(manualData, room, nowMs);
    const allCurrent = [...manualNow, ...originalNow];
    const override = manualOverrides[room] || 'auto';

    if (override === 'leave') {
        updateRoomDisplay('AVAILABLE 📘', 'green', room, null, elements);
    } else if (override === 'enter') {
        updateRoomDisplay('OCCUPIED', 'red', room, null, elements);
    } else {
        const originalConflict = checkConflictWithDetails(originalNow);
        const manualConflict = checkConflictWithDetails(manualNow);
        const bothHave = originalNow.length > 0 && manualNow.length > 0;
        const bothMatch = allOverlappingSchedulesMatch(originalNow, manualNow);

        if (originalConflict === 'yellow' || manualConflict === 'yellow') {
            updateRoomDisplay('CONFLICT ⚠️', 'yellow', room, allCurrent[0], elements);
        } else if (originalConflict === 'red' || manualConflict === 'red') {
            updateRoomDisplay('OCCUPIED', 'red', room, allCurrent[0], elements);
        } else if (bothHave && !bothMatch) {
            updateRoomDisplay('CONFLICT ⚠️', 'yellow', room, allCurrent[0], elements);
        } else if (bothHave && bothMatch) {
            updateRoomDisplay('OCCUPIED', 'red', room, allCurrent[0], elements);
        } else if (allCurrent.length > 0) {
            updateRoomDisplay('OCCUPIED', 'red', room, allCurrent[0], elements);
        } else {
            updateRoomDisplay('AVAILABLE', 'green', room, null, elements);
        }
    }
}

function filterActiveSchedules(schedules, room, nowMs) {
    if (room === '315') {
        return schedules.filter(s => {
            if (!s.start_time || !s.end_time) return true;
            const start = new Date(s.start_time).getTime();
            const end = new Date(s.end_time).getTime();
            return start <= nowMs && nowMs <= end;
        });
    }
    return schedules.filter(s => {
        if (!s.start_time || !s.end_time) return false;
        const start = new Date(s.start_time).getTime();
        const end = new Date(s.end_time).getTime();
        return start <= nowMs && nowMs <= end;
    });
}

function updateRoomDisplay(status, color, room, schedule, elements) {
    if (room === '315') {
        const systemStatus = document.getElementById("overall-status")?.textContent?.trim()?.toUpperCase();
        if (systemStatus?.includes("ON")) {
            status = 'OCCUPIED SENSOR READING';
            color = 'red';
        } else if (systemStatus?.includes("OFF")) {
            status = 'AVAILABLE';
            color = 'green';
        }
    }

    elements.roomStatusElement.textContent = status;
    elements.roomStatusElement.style.color = color;
    elements.roomNoElement.textContent = `ROOM ${room}`;
    elements.roomTypeElement.textContent = schedule?.subject || 'N/A';
    elements.roomScheduleElement.textContent = schedule
        ? `${formatTimeTo12Hour(schedule.start_time)} - ${formatTimeTo12Hour(schedule.end_time)}, ${new Date(schedule.date).toLocaleDateString()}`
        : 'N/A';
    elements.occupiedByElement.textContent = schedule?.section || 'N/A';
    elements.instructorElement.textContent = schedule?.prof || 'N/A';
    elements.representativeElement.textContent = schedule?.representative || 'N/A';
}

// ======================
// ROOM BUTTONS SYSTEM
// ======================
async function updateAllRoomButtons() {
    const roomNumbers = ['300', '302', '310', '311', '312', '313', '314', '315', '316'];
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const nowMs = localNow.getTime();
    const today = new Date(localNow);
    today.setHours(0, 0, 0, 0);

    try {
        const [{ data: originalData }, { data: manualData }] = await Promise.all([
            supabaseClient.from('schedules_originalv2').select('*'),
            supabaseClient.from('schedules_manualv2').select('*')
        ]);

        roomNumbers.forEach(room => {
            updateRoomButton(room, originalData, manualData, nowMs, today);
        });
    } catch (error) {
        console.error('Failed to fetch schedule data:', error);
    }
}

function updateRoomButton(room, originalData, manualData, nowMs, today) {
    const button = document.querySelector(`button[onclick*="'${room}'"]`);
    if (!button) return;

    const originalSchedules = originalData.filter(s => String(s.room) === String(room));
    const manualSchedules = manualData.filter(s => String(s.room) === String(room));

    button.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');

    if (room === '315') {
        handleRoom315Button(button, originalSchedules, manualSchedules, today);
        return;
    }

    const currentOriginal = findOverlappingNow(originalSchedules, nowMs);
    const currentManual = findOverlappingNow(manualSchedules, nowMs);
    const totalCurrent = [...currentOriginal, ...currentManual];

    const originalConflict = checkConflictWithDetails(currentOriginal);
    const manualConflict = checkConflictWithDetails(currentManual);
    const bothHave = currentOriginal.length > 0 && currentManual.length > 0;
    const bothMatch = allOverlappingSchedulesMatch(currentOriginal, currentManual);

    if (originalConflict === 'yellow' || manualConflict === 'yellow') {
        button.classList.add('bg-yellow-500');
    } else if (originalConflict === 'red' || manualConflict === 'red') {
        button.classList.add('bg-red-500');
    } else if (bothHave && !bothMatch) {
        button.classList.add('bg-yellow-500');
    } else if (bothHave && bothMatch) {
        button.classList.add('bg-red-500');
    } else if (totalCurrent.length > 0) {
        button.classList.add('bg-red-500');
    } else {
        button.classList.add('bg-green-500');
    }
}

function handleRoom315Button(button, originalSchedules, manualSchedules, today) {
    const todayOriginal = originalSchedules.filter(s => new Date(s.date) >= today);
    const todayManual = manualSchedules.filter(s => new Date(s.date) >= today);

    const hasOriginal = todayOriginal.length > 0;
    const hasManual = todayManual.length > 0;

    if (hasOriginal && hasManual) {
        const hasConflicts = hasConflictingSchedules(todayOriginal, todayManual);
        button.classList.add(hasConflicts ? 'bg-yellow-500' : 'bg-red-500');
    } else if (hasOriginal || hasManual) {
        button.classList.add('bg-red-500');
    } else {
        const systemStatus = document.getElementById("overall-status")?.textContent?.trim();
        button.classList.add(systemStatus?.includes("ON") ? 'bg-red-500' : 'bg-green-500');
    }
}

function hasConflictingSchedules(original, manual) {
    return original.some(o => 
        manual.some(m => 
            o.room !== m.room ||
            o.date !== m.date ||
            o.section !== m.section ||
            o.subject !== m.subject ||
            o.prof !== m.prof ||
            o.representative !== m.representative
        )
    );
}

function findOverlappingNow(schedules, nowMs) {
    return schedules.filter(s => {
        const start = new Date(s.start_time).getTime();
        const end = new Date(s.end_time).getTime();
        return start <= nowMs && nowMs <= end;
    });
}

function checkConflictWithDetails(schedules) {
    for (let i = 0; i < schedules.length; i++) {
        for (let j = i + 1; j < schedules.length; j++) {
            const a = schedules[i];
            const b = schedules[j];

            const aStart = new Date(a.start_time).getTime();
            const aEnd = new Date(a.end_time).getTime();
            const bStart = new Date(b.start_time).getTime();
            const bEnd = new Date(b.end_time).getTime();

            const isOverlap = aStart < bEnd && bStart < aEnd;

            if (isOverlap) {
                return schedulesMatch(a, b) ? 'red' : 'yellow';
            }
        }
    }
    return null;
}

function schedulesMatch(s1, s2) {
    return (
        s1.subject === s2.subject &&
        s1.prof === s2.prof &&
        s1.representative === s2.representative &&
        s1.section === s2.section &&
        new Date(s1.start_time).getTime() === new Date(s2.start_time).getTime() &&
        new Date(s1.end_time).getTime() === new Date(s2.end_time).getTime()
    );
}

function allOverlappingSchedulesMatch(originalNow, manualNow) {
    if (originalNow.length === 0 || manualNow.length === 0) return false;
    return manualNow.every(manual =>
        originalNow.some(original => schedulesMatch(original, manual))
    );
}

// ======================
// SCHEDULE FORM SYSTEM
// ======================
function openModal() {
    document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    document.getElementById("scheduleForm").reset();
    currentSchedule = null;
}

function openModalForAddSchedule() {
    if (!currentRoom) {
        alert("Please select a room first.");
        return;
    }
    
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("room").value = currentRoom;
    
    const timeFields = document.getElementById("time-fields-container");
    if (currentRoom === '315') {
        timeFields.classList.add("hidden");
    } else {
        timeFields.classList.remove("hidden");
    }
}

async function saveSchedule(event) {
    event?.preventDefault?.();
    
    const formData = getFormData();
    if (!validateForm(formData)) return;

    const submitButton = document.getElementById("submitButton");
    if (submitButton) submitButton.disabled = true;

    try {
        const isEditing = currentSchedule !== null;
        const response = await submitSchedule(formData, isEditing);

        if (!response.ok) throw new Error(await response.text());

        alert(isEditing ? "Schedule updated!" : "Schedule saved!");
        closeModal();
        updateRoomStatus(formData.room);

    } catch (err) {
        console.error("Save error:", err.message);
        alert("Failed: " + err.message);
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function getFormData() {
    const room = document.getElementById("room").value.trim();
    const date = document.getElementById("date").value.trim();
    const academicYear = document.getElementById("academicYear").value.trim();
    const semester = document.getElementById("semester").value.trim();
    const yearLevel = document.getElementById("yearLevel").value.trim();
    const section = document.getElementById("section").value.trim();
    const combinedSection = `${yearLevel}-${section}`;
    const subject = document.getElementById("subject").value.trim();
    
    let prof = document.getElementById("prof").value.trim();
    if (prof === "Others") {
        prof = document.getElementById("customProf").value.trim();
    }
    
    let representative = document.getElementById("representative").value.trim();
    if (representative === "Others") {
        representative = document.getElementById("customRepresentative").value.trim();
    }

    let startTime, endTime, startDateTime, endDateTime;
    if (room === '315') {
        startTime = endTime = '';
        startDateTime = endDateTime = null;
    } else {
        startTime = document.getElementById("startTime").value.trim();
        endTime = document.getElementById("endTime").value.trim();
        startDateTime = new Date(`${date}T${startTime}`).toISOString();
        endDateTime = new Date(`${date}T${endTime}`).toISOString();
    }

    return {
        room, date, academicYear, semester,
        start_time: startDateTime, end_time: endDateTime,
        section: combinedSection, subject, prof, representative
    };
}

function validateForm(formData) {
    if (!formData.room || !formData.date || !formData.academicYear || 
        !formData.semester || !formData.section || !formData.subject || 
        !formData.prof || !formData.representative) {
        alert("Please fill in all required fields before saving.");
        return false;
    }
    
    if (formData.room !== '315' && (!formData.start_time || !formData.end_time)) {
        alert("Please fill in start and end times for this room.");
        return false;
    }
    
    return true;
}

async function submitSchedule(formData, isEditing) {
    const method = isEditing ? 'PATCH' : 'POST';
    const url = isEditing
        ? `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${currentSchedule.id}`
        : `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`;

    return await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_API_KEY,
            'Authorization': `Bearer ${SUPABASE_API_KEY}`,
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(formData)
    });
}

async function deleteSchedule(source, index) {
    if (source !== 'Manual') {
        alert("Only manually added schedules can be deleted.");
        return;
    }

    if (!currentRoom) {
        alert("No room selected.");
        return;
    }

    try {
        const { data: manualData } = await supabaseClient
            .from('schedules_manualv2')
            .select('*')
            .eq('room', currentRoom)
            .order('start_time', { ascending: true });

        const scheduleToDelete = manualData[index];
        if (!scheduleToDelete) {
            alert("Schedule not found.");
            return;
        }

        const confirmed = confirm("Are you sure you want to delete this schedule?");
        if (!confirmed) return;

        await supabaseClient
            .from('schedules_manualv2')
            .delete()
            .eq('id', scheduleToDelete.id);

        updateRoomStatus(currentRoom);
    } catch (error) {
        console.error("Error deleting schedule:", error);
        alert("Failed to delete the schedule.");
    }
}

// ======================
// UTILITY FUNCTIONS
// ======================
function formatTimeTo12Hour(timeString, adjustFor315 = false) {
    if (!timeString) return '';
    
    const date = new Date(timeString);
    if (adjustFor315) date.setHours(date.getHours() - 8);

    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';

    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;

    return `${hours}:${minutes} ${ampm}`;
}

function toggleCustomProf() {
    const profDropdown = document.getElementById("prof");
    const customProfInput = document.getElementById("customProf");
    if (profDropdown.value === "Others") {
        customProfInput.classList.remove("hidden");
        customProfInput.required = true;
    } else {
        customProfInput.classList.add("hidden");
        customProfInput.required = false;
    }
}

function toggleCustomRepresentative() {
    const representativeDropdown = document.getElementById("representative");
    const customRepresentativeInput = document.getElementById("customRepresentative");
    if (representativeDropdown.value === "Others") {
        customRepresentativeInput.classList.remove("hidden");
        customRepresentativeInput.required = true;
    } else {
        customRepresentativeInput.classList.add("hidden");
        customRepresentativeInput.required = false;
    }
}

function removeSpecialChars(input) {
    const original = input.value;
    const cleaned = original
        .replace(/[^a-zA-Z0-9. ]/g, '')
        .replace(/\.(?=.*\.)/g, '');
    input.value = cleaned;
}

function manualOverrideChanged() {
    const value = document.getElementById("overrideStatus").value;
    if (currentRoom) {
        manualOverrides[currentRoom] = value;
        updateRoomStatus(currentRoom);
    }
}

async function roomClicked(room, event) {
    currentRoom = room;
    document.querySelectorAll(".toggle-button").forEach((btn) => {
        btn.classList.remove("border-4", "border-orange-800");
    });
    if (event) event.target.classList.add("border-4", "border-orange-800");

    document.getElementById("add-schedule-btn").disabled = false;
    document.getElementById("toggle-schedule-view").disabled = false;

    await updateRoomStatus(room, event);
}

function leaveRoom() {
    if (!currentRoom) {
        alert("Please select a room first.");
        return;
    }
    
    currentRoom = null;
    document.getElementById("add-schedule-btn").disabled = true;
    document.getElementById("toggle-schedule-view").disabled = true;

    document.querySelectorAll(".toggle-button").forEach((btn) => {
        btn.classList.remove("border-4", "border-orange-800");
    });

    resetRoomDetailsPanel();
}

function resetRoomDetailsPanel() {
    const elements = getRoomStatusElements();
    elements.roomStatusElement.textContent = "UNKNOWN";
    elements.roomStatusElement.style.color = "";
    elements.roomNoElement.textContent = "N/A";
    elements.occupiedByElement.textContent = "N/A";
    elements.roomTypeElement.textContent = "N/A";
    elements.roomScheduleElement.textContent = "N/A";
    elements.instructorElement.textContent = "N/A";
    elements.representativeElement.textContent = "N/A";
    resetScanIndicator(elements);
}

// ======================
// INITIALIZATION
// ======================
function initializeApplication() {
    const modal = document.getElementById("modal");
    if (modal) {
        new MutationObserver(handleModalStateChange)
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    updateAllRoomButtons();
    updateSensorData();
    if (currentRoom) updateRoomStatus(currentRoom);
    
    setInterval(updateAllRoomButtons, ROOM_UPDATE_INTERVAL);
    startAutoRefresh();
    
    const cleanupSubscriptions = setupRealtimeSubscriptions();
    
    if (!currentRoom) handleRoomClick('300');
    
    window.addEventListener('beforeunload', () => {
        cleanupSubscriptions();
        stopAutoRefresh();
    });
}

document.addEventListener("DOMContentLoaded", initializeApplication);
//ACCOUNT LOGIN

// ======================
// AUTHENTICATION SYSTEM
// ======================

// Initialize auth client (add this with your other Supabase config)
const supabaseAuthClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check auth state on page load
async function checkAuthState() {
    const { data: { session }, error } = await supabaseAuthClient.auth.getSession();
    
    // If no session and not on login page, redirect to login
    if (!session && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
        return false;
    }
    
    // If session exists and on login page, redirect to dashboard
    if (session && window.location.pathname.includes('login.html')) {
        window.location.href = 'index.html';
        return true;
    }
    
    return !!session;
}

// Login function
async function login(email, password) {
    const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        document.getElementById('errorMessage').textContent = error.message;
        return false;
    }

    return true;
}

// Logout function
async function logout() {
    const { error } = await supabaseAuthClient.auth.signOut();
    if (error) {
        console.error('Logout error:', error);
        return false;
    }
    window.location.href = 'login.html';
    return true;
}

// Add this to your initialization
async function initializeApplication() {
    const isAuthenticated = await checkAuthState();
    if (!isAuthenticated && !window.location.pathname.includes('login.html')) {
        return;
    }

    // Your existing initialization code...
    const modal = document.getElementById("modal");
    if (modal) {
        new MutationObserver(handleModalStateChange)
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }
    // Login Handler
// Add this to your index.js if it's the login page
if (window.location.pathname.includes('login.html')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        const success = await login(email, password);
        if (success) {
            window.location.href = 'index.html';
        }
    });
}

// Add this to your index.js for profile page functionality
if (window.location.pathname.includes('profile.html')) {
    document.addEventListener('DOMContentLoaded', async () => {
        const { data: { user }, error } = await supabaseAuthClient.auth.getUser();
        
        if (user) {
            document.getElementById('userName').textContent = user.email;
            document.getElementById('userEmail').textContent = user.email;
            document.getElementById('userInitials').textContent = 
                user.email.charAt(0).toUpperCase() + 
                (user.email.split('@')[0].length > 1 ? user.email.charAt(1).toUpperCase() : '');
            
            // Format dates
            const lastLogin = new Date(user.last_sign_in_at).toLocaleString();
            const createdAt = new Date(user.created_at).toLocaleString();
            
            document.getElementById('lastLogin').textContent = lastLogin;
            document.getElementById('accountCreated').textContent = createdAt;
        }

        document.getElementById('logoutBtn').addEventListener('click', logout);
    });
}

// Add this to your index.js for sidebar logout
document.getElementById('sidebarLogout')?.addEventListener('click', logout);