from ctypes import *
import math, random, os, cv2, time, sys
import numpy as np

sys.path.insert(1, '/var/darknet/')
import darknet

def convertBack(x, y, w, h):
    xmin = int(round(x - (w / 2)))
    xmax = int(round(x + (w / 2)))
    ymin = int(round(y - (h / 2)))
    ymax = int(round(y + (h / 2)))
    return xmin, ymin, xmax, ymax


def cvDrawBoxes(detections, img):
    for detection in detections:
        x, y, w, h = detection[2][0],\
            detection[2][1],\
            detection[2][2],\
            detection[2][3]
        xmin, ymin, xmax, ymax = convertBack(float(x), float(y), float(w), float(h))

        #scale to image, this is bad ... i know
        xscale = (xmax / 800) + xmax
        yscale = (ymax / 600) + ymax
        

        pt1 = (int(xmin), int(ymin))
        pt2 = (int(xmax + xscale), int(ymax + yscale))
        cv2.rectangle(img, pt1, pt2, (0, 0, 0), -1)

    return img


netMain = None
metaMain = None
altNames = None
darknet_image = None

def InitialiseYOLO():
    print('YOLO Init')
    global metaMain, netMain, altNames, darknet_image

    #configPath = "./cfg/yolov4.cfg"
    configPath = "/var/darknet/cfg/yolov3.cfg"
    #weightPath = "./yolov4.weights"
    weightPath = "/var/darknet/cfg/yolov3.weights"
    #metaPath = "./cfg/coco.data"
    metaPath = "/var/darknet/cfg/coco.data"

    if not os.path.exists(configPath):
        raise ValueError("Invalid config path `" +
                         os.path.abspath(configPath)+"`")
    if not os.path.exists(weightPath):
        raise ValueError("Invalid weight path `" +
                         os.path.abspath(weightPath)+"`")
    if not os.path.exists(metaPath):
        raise ValueError("Invalid data file path `" +
                         os.path.abspath(metaPath)+"`")
    if netMain is None:
        netMain = darknet.load_net_custom(configPath.encode(
            "ascii"), weightPath.encode("ascii"), 0, 1)  # batch size = 1
    if metaMain is None:
        metaMain = darknet.load_meta(metaPath.encode("ascii"))
    if altNames is None:
        try:
            with open(metaPath) as metaFH:
                metaContents = metaFH.read()
                import re
                match = re.search("names *= *(.*)$", metaContents,
                                  re.IGNORECASE | re.MULTILINE)
                if match:
                    result = match.group(1)
                else:
                    result = None
                try:
                    if os.path.exists(result):
                        with open(result) as namesFH:
                            namesList = namesFH.read().strip().split("\n")
                            altNames = [x.strip() for x in namesList]
                except TypeError:
                    pass
        except Exception:
            pass

    darknet_image = darknet.make_image(darknet.network_width(netMain),
                                    darknet.network_height(netMain),3)    
    return netMain, metaMain

def Inference(img):

    frame_resized = cv2.resize(img,
                                (darknet.network_width(netMain),
                                darknet.network_height(netMain)),
                                interpolation=cv2.INTER_LINEAR)

    framebytes = frame_resized.tobytes()
    darknet.copy_image_from_bytes(darknet_image, framebytes)

    detections = darknet.detect_image(netMain, metaMain, darknet_image, thresh=0.75)
    return detections

#As we are calling it during videoTransform just init
InitialiseYOLO()