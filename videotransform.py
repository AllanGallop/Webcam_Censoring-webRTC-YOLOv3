import cv2, sys, random
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from av import VideoFrame

#Use the local version of darknet_video
import darknet_video

class VideoTransform(MediaStreamTrack):
    kind = "video"
    boxes = None

    def __init__(self, track, transform):
        super().__init__()
        self.track = track
        self.transform = transform
        self.busy = True

    async def recv(self):
        #Grab frame from stream
        frame = await self.track.recv()
        img = frame.to_ndarray(format="rgb24")

        #take every ~1/10 frames to feed darknet, this can be done better
        #i'll probably make it adaptive
        if(random.randint(0,10) == 0):
            self.boxes = darknet_video.Inference(img)

        #If we have any detections add them to frame
        if(self.boxes):
            img = darknet_video.cvDrawBoxes(self.boxes, img)

        #Convert frame back to stream
        new_frame = VideoFrame.from_ndarray(img,format="rgb24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        return new_frame

